import { BadRequestException, Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  carregarCompeticaoDoProfessor,
  carregarLecionamentoDoProfessor,
} from '../shared/acesso-competicao.util.js';
import { exigirProfessor } from '../shared/acesso-escolar.util.js';
import { CriarCompeticaoDto } from './dto/criar-competicao.dto.js';

const TOTAL_BIMESTRES = 4;

@Injectable()
export class CompeticoesService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(user: UsuarioAutenticado | undefined, dto: CriarCompeticaoDto) {
    const professor = exigirProfessor(user);
    await carregarLecionamentoDoProfessor(
      this.prisma,
      professor.id,
      dto.lecionamentoId,
    );

    this.validarBimestres(dto);

    return this.prisma.$transaction(async (tx) => {
      const competicao = await tx.competicao.create({
        data: { nome: dto.nome, lecionamentoId: dto.lecionamentoId },
      });
      await tx.bimestre.createMany({
        data: dto.bimestres.map((bimestre) => ({
          competicaoId: competicao.id,
          numero: bimestre.numero,
          dataInicio: bimestre.dataInicio,
          dataFim: bimestre.dataFim,
        })),
      });
      const bimestres = await tx.bimestre.findMany({
        where: { competicaoId: competicao.id },
        orderBy: { numero: 'asc' },
      });
      return { ...competicao, bimestres };
    });
  }

  private validarBimestres(dto: CriarCompeticaoDto): void {
    const porNumero = new Map(dto.bimestres.map((b) => [b.numero, b]));
    if (porNumero.size !== TOTAL_BIMESTRES) {
      throw new BadRequestException('Números de bimestre duplicados.');
    }
    for (let numero = 1; numero <= TOTAL_BIMESTRES; numero++) {
      if (!porNumero.has(numero)) {
        throw new BadRequestException(
          `Faltando definição do bimestre ${numero}.`,
        );
      }
    }

    const ordenados = [...dto.bimestres].sort((a, b) => a.numero - b.numero);
    for (let i = 0; i < ordenados.length; i++) {
      const bimestre = ordenados[i];
      if (
        bimestre.dataFim.getTime() <= bimestre.dataInicio.getTime()
      ) {
        throw new BadRequestException(
          `Bimestre ${bimestre.numero} tem data fim anterior ou igual à data início.`,
        );
      }
      if (
        i > 0 &&
        bimestre.dataInicio.getTime() <=
          ordenados[i - 1].dataFim.getTime()
      ) {
        throw new BadRequestException(
          'Bimestres com datas sobrepostas ou fora da ordem crescente.',
        );
      }
    }
  }

  async detalhe(user: UsuarioAutenticado | undefined, competicaoId: string) {
    const professor = exigirProfessor(user);
    await carregarCompeticaoDoProfessor(
      this.prisma,
      professor.id,
      competicaoId,
    );
    return this.prisma.competicao.findUnique({
      where: { id: competicaoId },
      include: {
        bimestres: { orderBy: { numero: 'asc' } },
        gruposCompetidores: { orderBy: { nome: 'asc' } },
      },
    });
  }

  async listarDoLecionamento(
    user: UsuarioAutenticado | undefined,
    lecionamentoId: string,
  ) {
    const professor = exigirProfessor(user);
    await carregarLecionamentoDoProfessor(
      this.prisma,
      professor.id,
      lecionamentoId,
    );
    return this.prisma.competicao.findMany({
      where: { lecionamentoId },
      include: {
        bimestres: { orderBy: { numero: 'asc' } },
        gruposCompetidores: { orderBy: { nome: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}