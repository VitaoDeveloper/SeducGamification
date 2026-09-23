import { ConflictException, Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  carregarSalaComVinculoEscolar,
  exigirProfessor,
} from '../shared/acesso-escolar.util.js';
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
}