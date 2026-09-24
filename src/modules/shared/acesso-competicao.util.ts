import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { SituacaoBimestre } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';

export async function carregarLecionamentoDoProfessor(
  prisma: PrismaService,
  professorId: string,
  lecionamentoId: string,
): Promise<{ id: string; salaId: string }> {
  const lecionamento = await prisma.lecionamento.findUnique({
    where: { id: lecionamentoId },
    select: { id: true, salaId: true, professorId: true },
  });
  if (!lecionamento) {
    throw new NotFoundException('Lecionamento não encontrado.');
  }
  if (lecionamento.professorId !== professorId) {
    throw new ForbiddenException('Lecionamento pertence a outro professor.');
  }
  return lecionamento;
}

export async function carregarCompeticaoDoProfessor(
  prisma: PrismaService,
  professorId: string,
  competicaoId: string,
): Promise<{ id: string; lecionamentoId: string }> {
  const competicao = await prisma.competicao.findUnique({
    where: { id: competicaoId },
    select: {
      id: true,
      lecionamentoId: true,
      lecionamento: { select: { professorId: true, salaId: true } },
    },
  });
  if (!competicao) {
    throw new NotFoundException('Competição não encontrada.');
  }
  if (competicao.lecionamento.professorId !== professorId) {
    throw new ForbiddenException('Competição pertence a outro professor.');
  }
  return competicao;
}

export async function carregarGrupoDoProfessor(
  prisma: PrismaService,
  professorId: string,
  grupoId: string,
): Promise<{ id: string; competicaoId: string; salaId: string }> {
  const grupo = await prisma.grupoCompetidor.findUnique({
    where: { id: grupoId },
    select: {
      id: true,
      competicaoId: true,
      competicao: {
        select: {
          lecionamento: {
            select: { professorId: true, salaId: true },
          },
        },
      },
    },
  });
  if (!grupo) {
    throw new NotFoundException('Grupo não encontrado.');
  }
  if (grupo.competicao.lecionamento.professorId !== professorId) {
    throw new ForbiddenException(
      'Grupo pertence a uma competição de outro professor.',
    );
  }
  return {
    id: grupo.id,
    competicaoId: grupo.competicaoId,
    salaId: grupo.competicao.lecionamento.salaId,
  };
}

export async function carregarBimestreDoProfessor(
  prisma: PrismaService,
  professorId: string,
  bimestreId: string,
): Promise<{
  id: string;
  situacao: SituacaoBimestre;
  competicaoId: string;
  lecionamentoId: string;
  salaId: string;
}> {
  const bimestre = await prisma.bimestre.findUnique({
    where: { id: bimestreId },
    select: {
      id: true,
      situacao: true,
      competicaoId: true,
      competicao: {
        select: {
          lecionamentoId: true,
          lecionamento: { select: { professorId: true, salaId: true } },
        },
      },
    },
  });
  if (!bimestre) {
    throw new NotFoundException('Bimestre não encontrado.');
  }
  if (bimestre.competicao.lecionamento.professorId !== professorId) {
    throw new ForbiddenException(
      'Bimestre pertence a uma competição de outro professor.',
    );
  }
  return {
    id: bimestre.id,
    situacao: bimestre.situacao,
    competicaoId: bimestre.competicaoId,
    lecionamentoId: bimestre.competicao.lecionamentoId,
    salaId: bimestre.competicao.lecionamento.salaId,
  };
}