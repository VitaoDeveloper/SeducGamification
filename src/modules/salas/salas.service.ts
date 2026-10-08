import { ConflictException, Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  carregarSalaComVinculoEscolar,
  exigirProfessor,
  exigirVinculoProfessorEscola,
} from '../shared/acesso-escolar.util.js';
import {
  ESCOLA_COM_MODELO_DE_AVALIACAO,
  comModeloDeAvaliacao,
} from '../shared/escola-com-modelo.util.js';
import { AtualizarSalaDto } from './dto/atualizar-sala.dto.js';
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

  async atualizar(
    user: UsuarioAutenticado | undefined,
    salaId: string,
    dto: AtualizarSalaDto,
  ) {
    const professor = exigirProfessor(user);
    await carregarSalaComVinculoEscolar(this.prisma, professor.id, salaId);
    const sala = await this.prisma.sala.update({
      where: { id: salaId },
      data: { nome: dto.nome, anoLetivo: dto.anoLetivo },
      include: { escola: { select: ESCOLA_COM_MODELO_DE_AVALIACAO } },
    });
    return { ...sala, escola: comModeloDeAvaliacao(sala.escola) };
  }

  async excluir(
    user: UsuarioAutenticado | undefined,
    salaId: string,
  ): Promise<void> {
    const professor = exigirProfessor(user);
    await carregarSalaComVinculoEscolar(this.prisma, professor.id, salaId);

    const matriculas = await this.prisma.matricula.count({
      where: { salaId },
    });
    if (matriculas > 0) {
      throw new ConflictException('Sala possui alunos matriculados.');
    }

    const lecionamentos = await this.prisma.lecionamento.count({
      where: { salaId },
    });
    if (lecionamentos > 0) {
      throw new ConflictException('Sala possui professores inscritos.');
    }

    await this.prisma.sala.delete({ where: { id: salaId } });
  }
}