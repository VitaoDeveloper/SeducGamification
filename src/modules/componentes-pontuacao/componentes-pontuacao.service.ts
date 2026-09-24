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
import { CriarComponentePontuacaoDto } from './dto/criar-componente-pontuacao.dto.js';

const CEM_PORCENTO = 100;

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

    const materias = await this.prisma.componenteCurricular.findMany({
      where: { lecionamentoId: bimestre.lecionamentoId },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });

    const somas = await this.prisma.componentePontuacao.groupBy({
      by: ['componenteCurricularId'],
      where: { bimestreId },
      _sum: { pesoPercentual: true },
    });
    const somaPorMateria = new Map(
      somas.map((soma) => [soma.componenteCurricularId, soma._sum.pesoPercentual]),
    );

    const componentes = await this.prisma.componentePontuacao.findMany({
      where: { bimestreId },
      select: {
        id: true,
        nome: true,
        pesoPercentual: true,
        componenteCurricularId: true,
        createdAt: true,
      },
      orderBy: { nome: 'asc' },
    });

    const materiasResultado = materias.map((materia) => ({
      componenteCurricularId: materia.id,
      materiaNome: materia.nome,
      somaPesoPercentual: Number(somaPorMateria.get(materia.id) ?? 0),
      componentesPontuacao: componentes
        .filter((c) => c.componenteCurricularId === materia.id)
        .map((c) => ({
          ...c,
          pesoPercentual: Number(c.pesoPercentual),
        })),
    }));

    return {
      bimestreId,
      materias: materiasResultado,
      todasFechadas: materiasResultado.every(
        (materia) => materia.somaPesoPercentual === CEM_PORCENTO,
      ),
    };
  }

  async validar(
    user: UsuarioAutenticado | undefined,
    bimestreId: string,
  ) {
    const { materias } = await this.listar(user, bimestreId);
    const materiasPendentes = materias
      .filter((materia) => materia.somaPesoPercentual !== CEM_PORCENTO)
      .map((materia) => ({
        componenteCurricularId: materia.componenteCurricularId,
        materiaNome: materia.materiaNome,
        somaPesoPercentual: materia.somaPesoPercentual,
        faltaParaFechar: Number(
          (CEM_PORCENTO - materia.somaPesoPercentual).toFixed(2),
        ),
      }));

    return {
      fechado: materiasPendentes.length === 0,
      materiasPendentes,
    };
  }
}