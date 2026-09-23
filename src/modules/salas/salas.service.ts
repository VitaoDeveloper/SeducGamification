import { Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  exigirProfessor,
  exigirVinculoProfessorEscola,
} from '../shared/acesso-escolar.util.js';
import { CriarSalaDto } from './dto/criar-sala.dto.js';

@Injectable()
export class SalasService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(user: UsuarioAutenticado | undefined, dto: CriarSalaDto) {
    const professor = exigirProfessor(user);
    await exigirVinculoProfessorEscola(
      this.prisma,
      professor.id,
      dto.escolaId,
    );
    return this.prisma.sala.create({
      data: {
        nome: dto.nome,
        anoLetivo: dto.anoLetivo,
        escolaId: dto.escolaId,
        professorCriadorId: professor.id,
      },
      include: { escola: { select: { id: true, nome: true } } },
    });
  }

  async listarDoProfessor(user: UsuarioAutenticado | undefined) {
    const professor = exigirProfessor(user);
    const vinculos = await this.prisma.vinculoProfessor.findMany({
      where: { professorId: professor.id },
      select: { escolaId: true },
    });
    const escolasIds = [...new Set(vinculos.map((v) => v.escolaId))];
    return this.prisma.sala.findMany({
      where: { escolaId: { in: escolasIds } },
      include: { escola: { select: { id: true, nome: true } } },
      orderBy: [{ anoLetivo: 'desc' }, { nome: 'asc' }],
    });
  }
}