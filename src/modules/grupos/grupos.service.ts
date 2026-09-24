import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { SituacaoBimestre } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  carregarCompeticaoDoProfessor,
  carregarGrupoDoProfessor,
} from '../shared/acesso-competicao.util.js';
import { exigirProfessor } from '../shared/acesso-escolar.util.js';
import { AdicionarMembroDto } from './dto/adicionar-membro.dto.js';
import { CriarGrupoDto } from './dto/criar-grupo.dto.js';

@Injectable()
export class GruposService {
  constructor(private readonly prisma: PrismaService) {}

  async criarGrupo(
    user: UsuarioAutenticado | undefined,
    competicaoId: string,
    dto: CriarGrupoDto,
  ) {
    const professor = exigirProfessor(user);
    await carregarCompeticaoDoProfessor(
      this.prisma,
      professor.id,
      competicaoId,
    );
    return this.prisma.grupoCompetidor.create({
      data: { competicaoId, nome: dto.nome },
    });
  }

  async adicionarMembro(
    user: UsuarioAutenticado | undefined,
    grupoId: string,
    dto: AdicionarMembroDto,
  ) {
    const professor = exigirProfessor(user);
    const grupo = await carregarGrupoDoProfessor(
      this.prisma,
      professor.id,
      grupoId,
    );
    await this.carregarBimestreDaCompeticao(
      grupo.competicaoId,
      dto.bimestreId,
      true,
    );

    const alunoMatriculado = await this.prisma.matricula.findUnique({
      where: {
        alunoId_salaId: { alunoId: dto.alunoId, salaId: grupo.salaId },
      },
      select: { alunoId: true },
    });
    if (!alunoMatriculado) {
      throw new BadRequestException(
        'Aluno não está matriculado na sala desta competição.',
      );
    }

    const jaMembro = await this.prisma.membroGrupo.findFirst({
      where: {
        alunoId: dto.alunoId,
        bimestreId: dto.bimestreId,
        grupo: { competicaoId: grupo.competicaoId },
      },
      select: { grupoId: true },
    });
    if (jaMembro) {
      throw new ConflictException(
        'Aluno já pertence a um grupo desta competição no bimestre informado.',
      );
    }

    return this.prisma.membroGrupo.create({
      data: {
        grupoId,
        alunoId: dto.alunoId,
        bimestreId: dto.bimestreId,
      },
    });
  }

  async removerMembro(
    user: UsuarioAutenticado | undefined,
    grupoId: string,
    alunoId: string,
    bimestreId: string,
  ): Promise<void> {
    const professor = exigirProfessor(user);
    const grupo = await carregarGrupoDoProfessor(
      this.prisma,
      professor.id,
      grupoId,
    );
    await this.carregarBimestreDaCompeticao(
      grupo.competicaoId,
      bimestreId,
      true,
    );

    const chave = { grupoId, alunoId, bimestreId };
    const membro = await this.prisma.membroGrupo.findUnique({
      where: { grupoId_alunoId_bimestreId: chave },
      select: { alunoId: true },
    });
    if (!membro) {
      throw new NotFoundException(
        'Aluno não é membro deste grupo no bimestre informado.',
      );
    }
    await this.prisma.membroGrupo.delete({
      where: { grupoId_alunoId_bimestreId: chave },
    });
  }

  async listarGruposComMembros(
    user: UsuarioAutenticado | undefined,
    competicaoId: string,
    bimestreId?: string,
  ) {
    const professor = exigirProfessor(user);
    await carregarCompeticaoDoProfessor(
      this.prisma,
      professor.id,
      competicaoId,
    );

    let bimestreEfetivo = bimestreId;
    if (!bimestreEfetivo) {
      const bimestre = await this.prisma.bimestre.findFirst({
        where: { competicaoId, situacao: SituacaoBimestre.ABERTO },
        orderBy: { numero: 'desc' },
        select: { id: true },
      });
      if (!bimestre) {
        throw new BadRequestException(
          'Nenhum bimestre aberto encontrado para esta competição.',
        );
      }
      bimestreEfetivo = bimestre.id;
    } else {
      const bimestre = await this.prisma.bimestre.findFirst({
        where: { id: bimestreEfetivo, competicaoId },
        select: { id: true },
      });
      if (!bimestre) {
        throw new BadRequestException(
          'Bimestre informado não pertence a esta competição.',
        );
      }
    }

    const grupos = await this.prisma.grupoCompetidor.findMany({
      where: { competicaoId },
      include: {
        membrosGrupos: {
          where: { bimestreId: bimestreEfetivo },
          include: {
            aluno: {
              select: { id: true, nome: true, codigoMatricula: true },
            },
          },
          orderBy: { aluno: { nome: 'asc' } },
        },
      },
      orderBy: { nome: 'asc' },
    });

    return { bimestreId: bimestreEfetivo, grupos };
  }

  private async carregarBimestreDaCompeticao(
    competicaoId: string,
    bimestreId: string,
    exigirAberto: boolean,
  ) {
    const bimestre = await this.prisma.bimestre.findUnique({
      where: { id: bimestreId },
      select: { id: true, competicaoId: true, situacao: true },
    });
    if (!bimestre) {
      throw new NotFoundException('Bimestre não encontrado.');
    }
    if (bimestre.competicaoId !== competicaoId) {
      throw new BadRequestException(
        'Bimestre não pertence à competição deste grupo.',
      );
    }
    if (
      exigirAberto &&
      bimestre.situacao !== SituacaoBimestre.ABERTO
    ) {
      throw new ConflictException(
        'Não é possível alterar membros de um bimestre encerrado.',
      );
    }
    return bimestre;
  }
}