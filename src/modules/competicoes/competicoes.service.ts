import { ConflictException, Injectable } from '@nestjs/common';
import { SituacaoBimestre } from '../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  carregarCompeticaoDoProfessor,
  carregarLecionamentoDoProfessor,
} from '../shared/acesso-competicao.util.js';
import { exigirProfessor } from '../shared/acesso-escolar.util.js';
import { validarDatasBimestresConjunto } from '../shared/datas-bimestre.util.js';
import { AtualizarCompeticaoDto } from './dto/atualizar-competicao.dto.js';
import { CriarCompeticaoDto } from './dto/criar-competicao.dto.js';

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

    validarDatasBimestresConjunto(dto.bimestres);

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

  async atualizar(
    user: UsuarioAutenticado | undefined,
    competicaoId: string,
    dto: AtualizarCompeticaoDto,
  ) {
    const professor = exigirProfessor(user);
    await carregarCompeticaoDoProfessor(
      this.prisma,
      professor.id,
      competicaoId,
    );
    return this.prisma.competicao.update({
      where: { id: competicaoId },
      data: { nome: dto.nome },
    });
  }

  async excluir(
    user: UsuarioAutenticado | undefined,
    competicaoId: string,
  ): Promise<void> {
    const professor = exigirProfessor(user);
    await carregarCompeticaoDoProfessor(
      this.prisma,
      professor.id,
      competicaoId,
    );

    const bimestresEncerrados = await this.prisma.bimestre.count({
      where: { competicaoId, situacao: SituacaoBimestre.ENCERRADO },
    });
    if (bimestresEncerrados > 0) {
      throw new ConflictException(
        'Competição possui bimestres encerrados e não pode ser excluída.',
      );
    }

    const componentesPontuacao = await this.prisma.componentePontuacao.count({
      where: { bimestre: { competicaoId } },
    });
    if (componentesPontuacao > 0) {
      throw new ConflictException(
        'Competição já possui pontuação definida e não pode ser excluída.',
      );
    }

    const gruposComMembro = await this.prisma.membroGrupo.count({
      where: { grupo: { competicaoId } },
    });
    if (gruposComMembro > 0) {
      throw new ConflictException(
        'Competição possui grupos com integrantes e não pode ser excluída.',
      );
    }

    await this.prisma.competicao.delete({ where: { id: competicaoId } });
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