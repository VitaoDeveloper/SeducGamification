import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { carregarLecionamentoDoProfessor } from '../shared/acesso-competicao.util.js';
import {
  carregarSalaComVinculoEscolar,
  exigirProfessor,
} from '../shared/acesso-escolar.util.js';
import { AtualizarComponenteCurricularDto } from './dto/atualizar-componente-curricular.dto.js';
import { CriarComponenteCurricularDto } from './dto/criar-componente-curricular.dto.js';
import { InscricaoLecionamentoDto } from './dto/inscricao-lecionamento.dto.js';

@Injectable()
export class LecionamentosService {
  constructor(private readonly prisma: PrismaService) {}

  async inscrever(
    user: UsuarioAutenticado | undefined,
    salaId: string,
    dto: InscricaoLecionamentoDto,
  ) {
    const professor = exigirProfessor(user);
    await carregarSalaComVinculoEscolar(this.prisma, professor.id, salaId);

    const componentes = [
      ...new Set(dto.componentes.map((c) => c.trim())),
    ];

    const inscricaoExistente = await this.prisma.lecionamento.findFirst({
      where: { professorId: professor.id, salaId },
      select: { id: true },
    });
    if (inscricaoExistente) {
      throw new ConflictException(
        'Professor já está inscrito nesta sala.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const lecionamento = await tx.lecionamento.create({
        data: { professorId: professor.id, salaId },
      });
      await tx.componenteCurricular.createMany({
        data: componentes.map((nome) => ({
          nome,
          lecionamentoId: lecionamento.id,
        })),
      });
      const componentesCurriculares = await tx.componenteCurricular.findMany({
        where: { lecionamentoId: lecionamento.id },
        orderBy: { nome: 'asc' },
      });
      const professorDados = await tx.professor.findUnique({
        where: { id: professor.id },
        select: { id: true, nome: true, codigoMatricula: true },
      });
      return { ...lecionamento, componentesCurriculares, professor: professorDados };
    });
  }

  async listarDaSala(user: UsuarioAutenticado | undefined, salaId: string) {
    const professor = exigirProfessor(user);
    await carregarSalaComVinculoEscolar(this.prisma, professor.id, salaId);

    return this.prisma.lecionamento.findMany({
      where: { salaId },
      include: {
        professor: {
          select: { id: true, nome: true, codigoMatricula: true },
        },
        componentesCurriculares: {
          orderBy: { nome: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async adicionarComponente(
    user: UsuarioAutenticado | undefined,
    lecionamentoId: string,
    dto: CriarComponenteCurricularDto,
  ) {
    const professor = exigirProfessor(user);
    await carregarLecionamentoDoProfessor(
      this.prisma,
      professor.id,
      lecionamentoId,
    );

    const nome = dto.nome.trim();
    const duplicado = await this.prisma.componenteCurricular.findFirst({
      where: {
        lecionamentoId,
        nome: { equals: nome, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicado) {
      throw new ConflictException(
        'Já existe um componente curricular com esse nome neste lecionamento.',
      );
    }

    return this.prisma.componenteCurricular.create({
      data: { lecionamentoId, nome },
    });
  }

  async renomearComponente(
    user: UsuarioAutenticado | undefined,
    componenteCurricularId: string,
    dto: AtualizarComponenteCurricularDto,
  ) {
    const professor = exigirProfessor(user);
    await this.carregarComponenteDoProfessor(
      professor.id,
      componenteCurricularId,
    );

    return this.prisma.componenteCurricular.update({
      where: { id: componenteCurricularId },
      data: { nome: dto.nome.trim() },
    });
  }

  async removerComponente(
    user: UsuarioAutenticado | undefined,
    componenteCurricularId: string,
  ): Promise<void> {
    const professor = exigirProfessor(user);
    const componente = await this.carregarComponenteDoProfessor(
      professor.id,
      componenteCurricularId,
    );

    const pontuacoes = await this.prisma.componentePontuacao.count({
      where: { componenteCurricularId },
    });
    if (pontuacoes > 0) {
      throw new ConflictException(
        'Componente curricular já possui pontuação lançada e não pode ser excluído.',
      );
    }

    const totalNoLecionamento = await this.prisma.componenteCurricular.count({
      where: { lecionamentoId: componente.lecionamentoId },
    });
    if (totalNoLecionamento <= 1) {
      throw new ConflictException(
        'Não é possível excluir o último componente curricular do lecionamento. Use a desinscrição do lecionamento.',
      );
    }

    await this.prisma.componenteCurricular.delete({
      where: { id: componenteCurricularId },
    });
  }

  async desinscrever(
    user: UsuarioAutenticado | undefined,
    lecionamentoId: string,
  ): Promise<void> {
    const professor = exigirProfessor(user);
    await carregarLecionamentoDoProfessor(
      this.prisma,
      professor.id,
      lecionamentoId,
    );

    const competicoes = await this.prisma.competicao.count({
      where: { lecionamentoId },
    });
    if (competicoes > 0) {
      throw new ConflictException(
        'Lecionamento possui competições vinculadas e não pode ser desinscrito.',
      );
    }

    // Se houvesse ComponentePontuacao em algum componente curricular deste
    // lecionamento, teria havido uma Competicao (que já bloqueou acima), logo
    // a cascata apaga apenas componentes curriculares "vazios".
    await this.prisma.lecionamento.delete({ where: { id: lecionamentoId } });
  }

  private async carregarComponenteDoProfessor(
    professorId: string,
    componenteCurricularId: string,
  ): Promise<{ id: string; lecionamentoId: string }> {
    const componente = await this.prisma.componenteCurricular.findUnique({
      where: { id: componenteCurricularId },
      select: {
        id: true,
        lecionamentoId: true,
        lecionamento: { select: { professorId: true } },
      },
    });
    if (!componente) {
      throw new NotFoundException('Componente curricular não encontrado.');
    }
    if (componente.lecionamento.professorId !== professorId) {
      throw new ForbiddenException(
        'Componente curricular pertence a outro professor.',
      );
    }
    return componente;
  }
}