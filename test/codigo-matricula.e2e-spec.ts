import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { gerarCodigoMatricula } from '../src/modules/shared/codigo-matricula.util.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';

const ANO = new Date().getFullYear();

describe('gerarCodigoMatricula (e2e, concorrência)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const codigosCriados: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.aluno.deleteMany({
      where: { codigoMatricula: { in: codigosCriados } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('aloca códigos distintos em cadastros concorrentes na mesma transação', async () => {
    const transacao = (nome: string) =>
      prisma.$transaction(async (tx) => {
        const codigo = await gerarCodigoMatricula(tx, ANO, 'aluno');
        await tx.aluno.create({
          data: {
            nome,
            codigoMatricula: codigo,
            senhaHash: await hash('senha-concorrente', 4),
          },
        });
        return codigo;
      });

    const [a, b] = await Promise.all([
      transacao('Aluno Concorrente A'),
      transacao('Aluno Concorrente B'),
    ]);

    expect(a).not.toBe(b);
    expect(a).toMatch(/^\d{2}\d{3}$/);
    expect(b).toMatch(/^\d{2}\d{3}$/);

    codigosCriados.push(a, b);
  });
});