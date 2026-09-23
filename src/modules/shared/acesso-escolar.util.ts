import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { TIPO_USUARIO } from '../auth/usuario-autenticado.js';
import type { PrismaService } from '../prisma/prisma.service.js';

export function exigirProfessor(
  user: UsuarioAutenticado | undefined,
): UsuarioAutenticado {
  if (!user || user.tipo !== TIPO_USUARIO.PROFESSOR) {
    throw new ForbiddenException('Ação permitida apenas para professores.');
  }
  return user;
}

export async function exigirVinculoProfessorEscola(
  prisma: PrismaService,
  professorId: string,
  escolaId: string,
): Promise<void> {
  const vinculo = await prisma.vinculoProfessor.findUnique({
    where: {
      professorId_escolaId: { professorId, escolaId },
    },
    select: { professorId: true },
  });
  if (!vinculo) {
    throw new ForbiddenException(
      'Professor não está vinculado à escola desta sala.',
    );
  }
}

export async function carregarSalaComVinculoEscolar(
  prisma: PrismaService,
  professorId: string,
  salaId: string,
): Promise<{ id: string; escolaId: string }> {
  const sala = await prisma.sala.findUnique({
    where: { id: salaId },
    select: { id: true, escolaId: true },
  });
  if (!sala) {
    throw new NotFoundException('Sala não encontrada.');
  }
  await exigirVinculoProfessorEscola(prisma, professorId, sala.escolaId);
  return sala;
}