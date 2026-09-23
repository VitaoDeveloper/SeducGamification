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

describe('Salas, Alunos e Lecionamentos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const idsAlunos: string[] = [];
  const idsSalas: string[] = [];
  const idsEscolas: string[] = [];
  const idsProfessores: string[] = [];

  async function login(codigo: string, senha: string): Promise<string> {
    const resposta = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ codigoMatricula: codigo, senha })
      .expect(200);
    return resposta.body.accessToken as string;
  }

  async function criarProfessorCredenciado(
    nome: string,
    escolaId: string,
  ): Promise<{ codigo: string; token: string }> {
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
    await prisma.vinculoProfessor.create({
      data: { professorId: professor.id, escolaId },
    });
    idsProfessores.push(professor.id);
    return { codigo, token: await login(codigo, SENHA_PROFESSOR_T) };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const escolaExemplo = await prisma.escola.findFirstOrThrow({
      where: { nome: 'Escola Estadual de Exemplo' },
      select: { id: true, modeloAvaliacaoId: true },
    });

    const escolaFora = await prisma.escola.create({
      data: {
        nome: 'Escola de Fora (E2E)',
        modeloAvaliacaoId: escolaExemplo.modeloAvaliacaoId,
      },
    });
    idsEscolas.push(escolaFora.id);

    const professorSeed = await prisma.professor.findFirstOrThrow({
      where: { nome: 'Professor Exemplo' },
    });

    tokens.principal = await login(
      professorSeed.codigoMatricula,
      professorSeed.codigoMatricula,
    );
    tokens.segundo = (await criarProfessorCredenciado(
      'Professor Mesma Escola (E2E)',
      escolaExemplo.id,
    )).token;
    const profFora = await criarProfessorCredenciado(
      'Professor Fora (E2E)',
      escolaFora.id,
    );
    tokens.fora = profFora.token;
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

  const tokens = { principal: '', segundo: '', fora: '' };
  let escolaExemploId: string;
  let salaId: string;
  const nomesAlunos = ['Ana Beatriz', 'Bruno César', 'Camila Duarte'];

  it('fluxo: professor cria sala na própria escola', async () => {
    escolaExemploId = (
      await prisma.escola.findFirstOrThrow({
        where: { nome: 'Escola Estadual de Exemplo' },
      })
    ).id;

    const resposta = await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ nome: '2º DS', anoLetivo: ANO, escolaId: escolaExemploId })
      .expect(201);

    expect(resposta.body).toMatchObject({
      nome: '2º DS',
      anoLetivo: ANO,
      escolaId: escolaExemploId,
    });
    expect(resposta.body).toHaveProperty('id');
    salaId = resposta.body.id;
    idsSalas.push(salaId);
  });

  it('professor de escola não vinculada recebe 403 ao criar sala', async () => {
    await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokens.fora}`)
      .send({ nome: 'Sala Inválida', anoLetivo: ANO, escolaId: escolaExemploId })
      .expect(403);
  });

  it('professor se inscreve na sala com 2 componentes curriculares', async () => {
    const resposta = await request(app.getHttpServer())
      .post(`/salas/${salaId}/inscricao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componentes: ['Interfaces Web', 'Programação'] })
      .expect(201);

    expect(resposta.body).toHaveProperty('id');
    expect(resposta.body.componentesCurriculares).toHaveLength(2);
    expect(resposta.body.professor.nome).toBe('Professor Exemplo');
  });

  it('inscrição duplicada na mesma sala retorna 409', async () => {
    await request(app.getHttpServer())
      .post(`/salas/${salaId}/inscricao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componentes: ['Outra Matéria'] })
      .expect(409);
  });

  it('segundo professor da mesma escola lista a sala e se inscreve', async () => {
    const lista = await request(app.getHttpServer())
      .get('/salas')
      .set('Authorization', `Bearer ${tokens.segundo}`)
      .expect(200);

    expect(
      lista.body.some((sala: { id: string }) => sala.id === salaId),
    ).toBe(true);

    await request(app.getHttpServer())
      .post(`/salas/${salaId}/inscricao`)
      .set('Authorization', `Bearer ${tokens.segundo}`)
      .send({ componentes: ['Gestão de Projetos'] })
      .expect(201);
  });

  it('professor de escola não vinculada recebe 403 ao se inscrever', async () => {
    await request(app.getHttpServer())
      .post(`/salas/${salaId}/inscricao`)
      .set('Authorization', `Bearer ${tokens.fora}`)
      .send({ componentes: ['Qualquer'] })
      .expect(403);
  });

  it('lista os lecionamentos da sala com os respectivos componentes', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/salas/${salaId}/lecionamentos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body).toHaveLength(2);
    const nomes = resposta.body
      .flatMap((lec: { componentesCurriculares: { nome: string }[] }) =>
        lec.componentesCurriculares.map(
          (c: { nome: string }) => c.nome,
        ),
      )
      .sort();
    expect(nomes).toEqual(
      ['Gestão de Projetos', 'Interfaces Web', 'Programação'].sort(),
    );
  });

  it('cadastra 3 alunos na sala com senha = código de matrícula', async () => {
    for (const nome of nomesAlunos) {
      const resposta = await request(app.getHttpServer())
        .post(`/salas/${salaId}/alunos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ nome })
        .expect(201);

      expect(resposta.body.codigoMatricula).toMatch(/^\d{2}\d{3}$/);
      idsAlunos.push(resposta.body.codigoMatricula);
    }
  });

  it('lista os alunos matriculados na sala', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/salas/${salaId}/alunos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body).toHaveLength(3);
    expect(
      resposta.body.map((a: { nome: string }) => a.nome).sort(),
    ).toEqual([...nomesAlunos].sort());
  });

  it('aluno autenticado não consegue criar sala (403)', async () => {
    const aluno = await request(app.getHttpServer())
      .post(`/salas/${salaId}/alunos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ nome: 'Aluno Para Teste de Perfil' })
      .expect(201);
    idsAlunos.push(aluno.body.codigoMatricula);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        codigoMatricula: aluno.body.codigoMatricula,
        senha: aluno.body.codigoMatricula,
      })
      .expect(200);
    const tokenAluno = login.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokenAluno}`)
      .send({
        nome: 'Sala de Aluno',
        anoLetivo: ANO,
        escolaId: escolaExemploId,
      })
      .expect(403);
  });

  it('endpoints exigem autenticação (401)', async () => {
    await request(app.getHttpServer()).get('/salas').expect(401);
    await request(app.getHttpServer()).post('/salas').send({}).expect(401);
    await request(app.getHttpServer())
      .get(`/salas/${salaId}/alunos`)
      .expect(401);
  });
});