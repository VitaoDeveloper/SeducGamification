import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { gerarCodigoMatricula } from '../src/modules/shared/codigo-matricula.util.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';

const NOME_PROFESSOR_SEED = 'Professor Exemplo';
const ANO = new Date().getFullYear();

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let codigoSeed: string;
  let codigoTeste: string;
  const senhaTeste = 'senha-atual-e2e';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const professorSeed = await prisma.professor.findFirst({
      where: { nome: NOME_PROFESSOR_SEED },
    });
    expect(professorSeed).not.toBeNull();
    codigoSeed = professorSeed!.codigoMatricula;

    codigoTeste = await prisma.$transaction((tx) =>
      gerarCodigoMatricula(tx, ANO, 'professor'),
    );
    await prisma.professor.create({
      data: {
        nome: 'Professor E2E',
        codigoMatricula: codigoTeste,
        senhaHash: await hash(senhaTeste, 4),
      },
    });
  });

  afterAll(async () => {
    await prisma.professor.deleteMany({
      where: { codigoMatricula: codigoTeste },
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('POST /auth/login com professor semeado retorna 200 e JWT', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ codigoMatricula: codigoSeed, senha: codigoSeed })
      .expect(200);

    expect(resposta.body).toHaveProperty('accessToken');
    expect(typeof resposta.body.accessToken).toBe('string');
  });

  it('POST /auth/login com senha errada retorna 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ codigoMatricula: codigoSeed, senha: 'senha-incorreta' })
      .expect(401);
  });

  it('POST /auth/login com código inexistente retorna 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ codigoMatricula: '99999', senha: 'qualquer' })
      .expect(401);
  });

  it('POST /auth/login rejeita campo extra (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ codigoMatricula: codigoSeed, senha: codigoSeed, campoExtra: 1 })
      .expect(400);
  });

  it('GET /auth/me rejeita requisição sem token (401)', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/me aceita token válido e expõe { id, tipo }', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ codigoMatricula: codigoTeste, senha: senhaTeste })
      .expect(200);

    const token: string = login.body.accessToken;

    const professor = await prisma.professor.findFirst({
      where: { codigoMatricula: codigoTeste },
    });

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(me.body).toEqual({ id: professor!.id, tipo: 'PROFESSOR' });
  });

  it('GET /auth/me rejeita token inválido (401)', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
  });

  it('POST /auth/trocar-senha troca a senha e a antiga deixa de funcionar', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ codigoMatricula: codigoTeste, senha: senhaTeste })
      .expect(200);
    const token: string = login.body.accessToken;

    const novaSenha = 'nova-senha-e2e';

    await request(app.getHttpServer())
      .post('/auth/trocar-senha')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: senhaTeste, novaSenha })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ codigoMatricula: codigoTeste, senha: senhaTeste })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ codigoMatricula: codigoTeste, senha: novaSenha })
      .expect(200);
  });

  it('POST /auth/trocar-senha rejeita senha atual errada (401)', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ codigoMatricula: codigoSeed, senha: codigoSeed })
      .expect(200);
    const token: string = login.body.accessToken;

    await request(app.getHttpServer())
      .post('/auth/trocar-senha')
      .set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: 'senha-errada', novaSenha: 'qualquer' })
      .expect(401);
  });

  it('POST /auth/trocar-senha exige autenticação', async () => {
    await request(app.getHttpServer())
      .post('/auth/trocar-senha')
      .send({ senhaAtual: 'x', novaSenha: 'y' })
      .expect(401);
  });
});