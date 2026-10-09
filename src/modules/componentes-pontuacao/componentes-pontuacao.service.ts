import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SituacaoBimestre } from '../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { carregarBimestreDoProfessor } from '../shared/acesso-competicao.util.js';
import { exigirProfessor } from '../shared/acesso-escolar.util.js';
import {
  CEM_PORCENTO,
  carregarMateriasComPesos,
  materiasFechadas,
  selecionarMateriasPendentes,
} from '../shared/pesos-bimestre.util.js';
import { AtualizarComponentePontuacaoDto } from './dto/atualizar-componente-pontuacao.dto.js';
import { CriarComponentePontuacaoDto } from './dto/criar-componente-pontuacao.dto.js';

@Injectable()
export class ComponentesPontuacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(
    user: UsuarioAutenticado | undefined,
    bimestreId: string,
    dto: CriarComponentePontuacaoDto,
  ) {
    const professor = exigirProfessor(user);
    const bimestre = await carregarBimestreDoProfessor(
      this.prisma,
      professor.id,
      bimestreId,
    );
    if (bimestre.situacao !== SituacaoBimestre.ABERTO) {
      throw new ConflictException(
        'Não é possível criar componentes de pontuação em um bimestre encerrado.',
      );
    }

    const materia = await this.prisma.componenteCurricular.findUnique({
      where: { id: dto.componenteCurricularId },
      select: { id: true, lecionamentoId: true },
    });
    if (!materia) {
      throw new NotFoundException('Componente curricular não encontrado.');
    }
    if (materia.lecionamentoId !== bimestre.lecionamentoId) {
      throw new BadRequestException(
        'Componente curricular não pertence ao lecionamento desta competição.',
      );
    }

    const somaAtual = await this.prisma.componentePontuacao.aggregate({
      where: {
        bimestreId,
        componenteCurricularId: dto.componenteCurricularId,
      },
      _sum: { pesoPercentual: true },
    });
    const somaAtualNumero = somaAtual._sum.pesoPercentual
      ? Number(somaAtual._sum.pesoPercentual)
      : 0;
    if (somaAtualNumero + dto.pesoPercentual > CEM_PORCENTO + 0.0001) {
      throw new BadRequestException(
        'O peso ultrapassaria 100% para esta matéria no bimestre.',
      );
    }

    const componente = await this.prisma.componentePontuacao.create({
      data: {
        bimestreId,
        componenteCurricularId: dto.componenteCurricularId,
        nome: dto.nome,
        pesoPercentual: dto.pesoPercentual,
      },
    });

    return {
      ...componente,
      pesoPercentual: Number(componente.pesoPercentual),
    };
  }

  async atualizar(
    user: UsuarioAutenticado | undefined,
    componentePontuacaoId: string,
    dto: AtualizarComponentePontuacaoDto,
  ) {
    const professor = exigirProfessor(user);
    const componente = await this.carregarComponenteDoProfessor(
      professor.id,
      componentePontuacaoId,
    );
    await this.exigirBimestreAberto(componente.bimestreId, professor.id);

    const data: { nome?: string; pesoPercentual?: number } = {};
    if (dto.nome !== undefined) {
      data.nome = dto.nome;
    }
    if (dto.pesoPercentual !== undefined) {
      await this.validarSomaComNovoPeso(componente, dto.pesoPercentual);
      data.pesoPercentual = dto.pesoPercentual;
    }

    const atualizado = await this.prisma.componentePontuacao.update({
      where: { id: componentePontuacaoId },
      data,
    });

    return {
      ...atualizado,
      pesoPercentual: Number(atualizado.pesoPercentual),
    };
  }

  async excluir(
    user: UsuarioAutenticado | undefined,
    componentePontuacaoId: string,
  ): Promise<void> {
    const professor = exigirProfessor(user);
    const componente = await this.carregarComponenteDoProfessor(
      professor.id,
      componentePontuacaoId,
    );
    await this.exigirBimestreAberto(componente.bimestreId, professor.id);

    // Bimestre ainda aberto: a cascata remove os Lançamento deste componente,
    // o que ainda é seguro pois nada foi congelado em síntese.
    await this.prisma.componentePontuacao.delete({
      where: { id: componentePontuacaoId },
    });
  }

  async listar(
    user: UsuarioAutenticado | undefined,
    bimestreId: string,
  ) {
    const professor = exigirProfessor(user);
    const bimestre = await carregarBimestreDoProfessor(
      this.prisma,
      professor.id,
      bimestreId,
    );

    const materias = await carregarMateriasComPesos(
      this.prisma,
      bimestreId,
      bimestre.lecionamentoId,
    );

    return {
      bimestreId,
      materias,
      todasFechadas: materiasFechadas(materias),
    };
  }

  async validar(
    user: UsuarioAutenticado | undefined,
    bimestreId: string,
  ) {
    const { materias } = await this.listar(user, bimestreId);
    const materiasPendentes = selecionarMateriasPendentes(materias);

    return {
      fechado: materiasPendentes.length === 0,
      materiasPendentes,
    };
  }

  private async carregarComponenteDoProfessor(
    professorId: string,
    componentePontuacaoId: string,
  ): Promise<{
    id: string;
    bimestreId: string;
    pesoPercentual: number;
    componenteCurricularId: string | null;
  }> {
    const componente = await this.prisma.componentePontuacao.findUnique({
      where: { id: componentePontuacaoId },
      select: {
        id: true,
        bimestreId: true,
        pesoPercentual: true,
        componenteCurricularId: true,
      },
    });
    if (!componente) {
      throw new NotFoundException('Componente de pontuação não encontrado.');
    }
    return {
      id: componente.id,
      bimestreId: componente.bimestreId,
      pesoPercentual: Number(componente.pesoPercentual),
      componenteCurricularId: componente.componenteCurricularId,
    };
  }

  private async exigirBimestreAberto(
    bimestreId: string,
    professorId: string,
  ): Promise<void> {
    const bimestre = await carregarBimestreDoProfessor(
      this.prisma,
      professorId,
      bimestreId,
    );
    if (bimestre.situacao !== SituacaoBimestre.ABERTO) {
      throw new ConflictException(
        'Não é possível alterar componentes de pontuação em um bimestre encerrado.',
      );
    }
  }

  private async validarSomaComNovoPeso(
    componente: {
      bimestreId: string;
      pesoPercentual: number;
      componenteCurricularId: string | null;
    },
    novoPesoPercentual: number,
  ): Promise<void> {
    if (componente.componenteCurricularId === null) {
      return;
    }
    const somaAtual = await this.prisma.componentePontuacao.aggregate({
      where: {
        bimestreId: componente.bimestreId,
        componenteCurricularId: componente.componenteCurricularId,
      },
      _sum: { pesoPercentual: true },
    });
    const somaAtualNumero = somaAtual._sum.pesoPercentual
      ? Number(somaAtual._sum.pesoPercentual)
      : 0;
    const novaSoma =
      somaAtualNumero -
      Number(componente.pesoPercentual) +
      novoPesoPercentual;
    if (novaSoma > CEM_PORCENTO + 0.0001) {
      throw new BadRequestException(
        'O peso ultrapassaria 100% para esta matéria no bimestre.',
      );
    }
  }
}
