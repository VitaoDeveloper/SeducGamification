import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { gerarCodigoMatricula } from '../src/modules/shared/codigo-matricula.util.js';

const ANO = new Date().getFullYear();
const SENHA_PROFESSOR_T = 'senha-professor-teste';
const NOME_ESCOLA_A = 'Escola Alfa (E2E Escolas)';
const NOME_ESCOLA_B = 'Escola Beta (E2E Escolas)';

describe('Escolas (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const idsAlunos: string[] = [];
  const idsSalas: string[] = [];
  const idsEscolas: string[] = [];
  const idsProfessores: string[] = [];

  const tokens = { uma: '', varias: '', nenhuma: '', aluno: '' };
  let escolaAId: string;
  let escolaBId: string;

  async function login(codigo: string, senha: string): Promise<string> {
    const resposta = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ codigoMatricula: codigo, senha })
      .expect(200);
    return resposta.body.accessToken as string;
  }

  async function criarProfessorCredenciado(
    nome: string,
    escolaIds: string[],
  ): Promise<{ token: string }> {
    const codigo = await prisma.$transaction((tx) =>
      gerarCodigoMatricula(tx, ANO, 'professor'),
    );
    const professor = await prisma.professor.create({
      data: {
        nome,
        codigoMatricula: codigo,
        senhaHash: await hash(SENHA_PROFESSOR_T, 4),
      },
    });
    await prisma.vinculoProfessor.createMany({
      data: escolaIds.map((escolaId) => ({ professorId: professor.id, escolaId })),
    });
    idsProfessores.push(professor.id);
    return { token: await login(codigo, SENHA_PROFESSOR_T) };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const modelo = await prisma.modeloAvaliacao.findFirstOrThrow();

    for (const nome of [NOME_ESCOLA_A, NOME_ESCOLA_B]) {
      const escola = await prisma.escola.create({
        data: { nome, modeloAvaliacaoId: modelo.id },
      });
      idsEscolas.push(escola.id);
    }
    [escolaAId, escolaBId] = idsEscolas;

    tokens.uma = (
      await criarProfessorCredenciado('Professor Uma Escola (E2E)', [escolaAId])
    ).token;
    tokens.varias = (
      await criarProfessorCredenciado('Professor Duas Escolas (E2E)', [
        escolaAId,
        escolaBId,
      ])
    ).token;
    tokens.nenhuma = (
      await criarProfessorCredenciado('Professor Sem Vínculo (E2E)', [])
    ).token;

    /*
     * Um aluno de verdade, para a rota passar pela guarda de perfil: a recusa
     * esperada é do `exigirProfessor` no serviço, e um token de aluno emitido
     * à mão não provaria nada sobre o caminho que o `AuthGuard` monta.
     */
    const sala = await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokens.uma}`)
      .send({ nome: 'Sala Do Aluno (E2E)', anoLetivo: ANO, escolaId: escolaAId })
      .expect(201);
    idsSalas.push(sala.body.id);

    const aluno = await request(app.getHttpServer())
      .post(`/salas/${sala.body.id}/alunos`)
      .set('Authorization', `Bearer ${tokens.uma}`)
      .send({ nome: 'Aluno Para Teste de Perfil (E2E)' })
      .expect(201);
    idsAlunos.push(aluno.body.codigoMatricula);
    tokens.aluno = await login(
      aluno.body.codigoMatricula as string,
      aluno.body.codigoMatricula as string,
    );
  });

  afterAll(async () => {
    await prisma.aluno.deleteMany({
      where: { codigoMatricula: { in: idsAlunos } },
    });
    await prisma.lecionamento.deleteMany({
      where: { salaId: { in: idsSalas } },
    });
    await prisma.sala.deleteMany({
      where: { id: { in: idsSalas } },
    });
    await prisma.professor.deleteMany({
      where: { id: { in: idsProfessores } },
    });
    await prisma.escola.deleteMany({
      where: { id: { in: idsEscolas } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('lista a escola de quem tem um vínculo só', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/escolas')
      .set('Authorization', `Bearer ${tokens.uma}`)
      .expect(200);

    expect(resposta.body).toEqual([{ id: escolaAId, nome: NOME_ESCOLA_A }]);
  });

  it('lista as duas escolas de quem tem dois vínculos, sem repetir', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/escolas')
      .set('Authorization', `Bearer ${tokens.varias}`)
      .expect(200);

    expect(resposta.body).toEqual([
      { id: escolaAId, nome: NOME_ESCOLA_A },
      { id: escolaBId, nome: NOME_ESCOLA_B },
    ]);
    // A chave composta do vínculo já impede a duplicata; o teste fixa o
    // contrato para o dia em que a consulta for trocada por uma sobre `salas`.
    expect(new Set(resposta.body.map((e: { id: string }) => e.id)).size).toBe(2);
  });

  it('devolve lista vazia para professor sem nenhum vínculo', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/escolas')
      .set('Authorization', `Bearer ${tokens.nenhuma}`)
      .expect(200);

    expect(resposta.body).toEqual([]);
  });

  it('devolve a escola mesmo quando não há nenhuma sala nela', async () => {
    const semSalas = (
      await criarProfessorCredenciado('Professor Escola Sem Sala (E2E)', [escolaBId])
    ).token;

    const salas = await request(app.getHttpServer())
      .get('/salas')
      .set('Authorization', `Bearer ${semSalas}`)
      .expect(200);
    expect(salas.body).toEqual([]);

    const escolas = await request(app.getHttpServer())
      .get('/escolas')
      .set('Authorization', `Bearer ${semSalas}`)
      .expect(200);
    expect(escolas.body).toEqual([{ id: escolaBId, nome: NOME_ESCOLA_B }]);
  });

  it('aluno autenticado não lista escolas (403)', async () => {
    await request(app.getHttpServer())
      .get('/escolas')
      .set('Authorization', `Bearer ${tokens.aluno}`)
      .expect(403);
  });

  it('exige autenticação (401)', async () => {
    await request(app.getHttpServer()).get('/escolas').expect(401);
  });
});
