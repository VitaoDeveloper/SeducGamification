import { ConflictException, Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  carregarSalaComVinculoEscolar,
  exigirProfessor,
} from '../shared/acesso-escolar.util.js';
import { gerarCodigoMatricula } from '../shared/codigo-matricula.util.js';
import { CriarAlunoDto } from './dto/criar-aluno.dto.js';

const ROUNDS_HASH_SENHA = 10;

@Injectable()
export class AlunosService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(
    user: UsuarioAutenticado | undefined,
    salaId: string,
    dto: CriarAlunoDto,
  ) {
    const professor = exigirProfessor(user);
    await carregarSalaComVinculoEscolar(
      this.prisma,
      professor.id,
      salaId,
    );

    const ano = new Date().getFullYear();

    return this.prisma.$transaction(async (tx) => {
      const codigoMatricula = await gerarCodigoMatricula(tx, ano, 'aluno');
      const aluno = await tx.aluno.create({
        data: {
          nome: dto.nome,
          codigoMatricula,
          senhaHash: await hash(codigoMatricula, ROUNDS_HASH_SENHA),
        },
      });

      // RN4 (doc 01): aluno pertence a uma única sala por vez.
      // Como o aluno é criado nesta mesma transação, nunca existe matrícula
      // prévia — a checagem é defensiva para futuras transferências entre
      // salas (fora do alpha).
      const matriculaExistente = await tx.matricula.findUnique({
        where: {
          alunoId_salaId: { alunoId: aluno.id, salaId },
        },
        select: { alunoId: true },
      });
      if (matriculaExistente) {
        throw new ConflictException(
          'Aluno já possui matrícula ativa em outra sala.',
        );
      }

      await tx.matricula.create({
        data: { alunoId: aluno.id, salaId },
      });

      return aluno;
    });
  }

  async listarDaSala(user: UsuarioAutenticado | undefined, salaId: string) {
    const professor = exigirProfessor(user);
    await carregarSalaComVinculoEscolar(this.prisma, professor.id, salaId);

    return this.prisma.aluno.findMany({
      where: { matriculas: { some: { salaId } } },
      select: {
        id: true,
        nome: true,
        codigoMatricula: true,
        createdAt: true,
      },
      orderBy: { nome: 'asc' },
    });
  }
}