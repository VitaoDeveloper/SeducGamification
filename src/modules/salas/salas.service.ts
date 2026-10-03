import { Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  exigirProfessor,
  exigirVinculoProfessorEscola,
} from '../shared/acesso-escolar.util.js';
import {
  ESCOLA_COM_MODELO_DE_AVALIACAO,
  comModeloDeAvaliacao,
} from '../shared/escola-com-modelo.util.js';
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
    const sala = await this.prisma.sala.create({
      data: {
        nome: dto.nome,
        anoLetivo: dto.anoLetivo,
        escolaId: dto.escolaId,
        professorCriadorId: professor.id,
      },
      include: { escola: { select: ESCOLA_COM_MODELO_DE_AVALIACAO } },
    });
    return { ...sala, escola: comModeloDeAvaliacao(sala.escola) };
  }

  async listarDoProfessor(user: UsuarioAutenticado | undefined) {
    const professor = exigirProfessor(user);
    const vinculos = await this.prisma.vinculoProfessor.findMany({
      where: { professorId: professor.id },
      select: { escolaId: true },
    });
    const escolasIds = [...new Set(vinculos.map((v) => v.escolaId))];
    const salas = await this.prisma.sala.findMany({
      where: { escolaId: { in: escolasIds } },
      include: { escola: { select: ESCOLA_COM_MODELO_DE_AVALIACAO } },
      orderBy: [{ anoLetivo: 'desc' }, { nome: 'asc' }],
    });
    return salas.map((sala) => ({
      ...sala,
      escola: comModeloDeAvaliacao(sala.escola),
    }));
  }
}