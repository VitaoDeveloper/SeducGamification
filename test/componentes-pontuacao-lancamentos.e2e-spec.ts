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
const ID_MODELO_NUMERICO = '00000000-0000-0000-0000-000000000001';

function dataIso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function bimestresDeCompeticao() {
  return [
    { numero: 1, dataInicio: dataIso(ANO, 2, 2), dataFim: dataIso(ANO, 4, 24) },
    { numero: 2, dataInicio: dataIso(ANO, 4, 27), dataFim: dataIso(ANO, 7, 3) },
    { numero: 3, dataInicio: dataIso(ANO, 8, 3), dataFim: dataIso(ANO, 10, 2) },
    { numero: 4, dataInicio: dataIso(ANO, 10, 5), dataFim: dataIso(ANO, 12, 18) },
  ];
}

describe('Componentes de Pontuação e Lançamentos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const idsAlunos: string[] = [];
  const idsSalas: string[] = [];
  const idsEscolas: string[] = [];
  const idsProfessores: string[] = [];
  const idsLecionamentos: string[] = [];
  const idsCompeticoes: string[] = [];

  const tokens = { principal: '', numerico: '', fora: '' };

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
        nome: 'Escola Fora Pontos (E2E)',
        modeloAvaliacaoId: escolaExemplo.modeloAvaliacaoId,
      },
    });
    idsEscolas.push(escolaFora.id);

    const escolaNumerica = await prisma.escola.create({
      data: {
        nome: 'Escola Numerica Pontos (E2E)',
        modeloAvaliacaoId: ID_MODELO_NUMERICO,
      },
    });
    idsEscolas.push(escolaNumerica.id);

    const professorSeed = await prisma.professor.findFirstOrThrow({
      where: { nome: 'Professor Exemplo' },
    });

    tokens.principal = await login(
      professorSeed.codigoMatricula,
      professorSeed.codigoMatricula,
    );
    tokens.numerico = (await criarProfessorCredenciado(
      'Professor Numerico Pontos (E2E)',
      escolaNumerica.id,
    )).token;
    tokens.fora = (await criarProfessorCredenciado(
      'Professor Fora Pontos (E2E)',
      escolaFora.id,
    )).token;
  });

  afterAll(async () => {
    await prisma.competicao.deleteMany({
      where: { id: { in: idsCompeticoes } },
    });
    await prisma.lecionamento.deleteMany({
      where: { id: { in: idsLecionamentos } },
    });
    await prisma.sala.deleteMany({ where: { id: { in: idsSalas } } });
    await prisma.aluno.deleteMany({
      where: { codigoMatricula: { in: idsAlunos } },
    });
    await prisma.professor.deleteMany({
      where: { id: { in: idsProfessores } },
    });
    await prisma.escola.deleteMany({ where: { id: { in: idsEscolas } } });
    await prisma.$disconnect();
    await app.close();
  });

  let escolaExemploId: string;
  let escolaNumericaId: string;
  let salaId: string;
  let lecionamentoId: string;
  let materiaMat = '';
  let materiaPor = '';
  let competicaoId: string;
  let idBimestre1 = '';
  let idBimestre2 = '';
  const idsAlunosSala: string[] = [];

  let salaNumId: string;
  let lecionamentoNumId: string;
  let materiaNum = '';
  let competicaoNumId: string;
  let idBimestreNum1 = '';
  let alunoNumId = '';

  it('fluxo: cria sala, inscrição com 2 matérias e 3 alunos', async () => {
    escolaExemploId = (
      await prisma.escola.findFirstOrThrow({
        where: { nome: 'Escola Estadual de Exemplo' },
      })
    ).id;
    escolaNumericaId = (
      await prisma.escola.findFirstOrThrow({
        where: { nome: 'Escola Numerica Pontos (E2E)' },
      })
    ).id;

    const sala = await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        nome: '2º DS (Pontos)',
        anoLetivo: ANO,
        escolaId: escolaExemploId,
      })
      .expect(201);
    salaId = sala.body.id;
    idsSalas.push(salaId);

    const inscricao = await request(app.getHttpServer())
      .post(`/salas/${salaId}/inscricao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componentes: ['Matemática', 'Português'] })
      .expect(201);
    lecionamentoId = inscricao.body.id;
    idsLecionamentos.push(lecionamentoId);
    materiaMat = inscricao.body.componentesCurriculares.find(
      (c: { nome: string }) => c.nome === 'Matemática',
    ).id;
    materiaPor = inscricao.body.componentesCurriculares.find(
      (c: { nome: string }) => c.nome === 'Português',
    ).id;

    for (let i = 1; i <= 3; i++) {
      const aluno = await request(app.getHttpServer())
        .post(`/salas/${salaId}/alunos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ nome: `Notado ${i} (E2E)` })
        .expect(201);
      idsAlunos.push(aluno.body.codigoMatricula);
      idsAlunosSala.push(aluno.body.id);
    }
  });

  it('fluxo: cria sala numérica com 1 aluno', async () => {
    const sala = await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokens.numerico}`)
      .send({
        nome: '1º A (Numerica)',
        anoLetivo: ANO,
        escolaId: escolaNumericaId,
      })
      .expect(201);
    salaNumId = sala.body.id;
    idsSalas.push(salaNumId);

    const inscricao = await request(app.getHttpServer())
      .post(`/salas/${salaNumId}/inscricao`)
      .set('Authorization', `Bearer ${tokens.numerico}`)
      .send({ componentes: ['Matemática'] })
      .expect(201);
    lecionamentoNumId = inscricao.body.id;
    idsLecionamentos.push(lecionamentoNumId);
    materiaNum = inscricao.body.componentesCurriculares[0].id;

    const aluno = await request(app.getHttpServer())
      .post(`/salas/${salaNumId}/alunos`)
      .set('Authorization', `Bearer ${tokens.numerico}`)
      .send({ nome: 'Aluno Numerico (E2E)' })
      .expect(201);
    idsAlunos.push(aluno.body.codigoMatricula);
    alunoNumId = aluno.body.id;
  });

  it('cria competição principal e captura o bimestre 1', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/competicoes')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ nome: 'Pontos 2026', lecionamentoId, bimestres: bimestresDeCompeticao() })
      .expect(201);
    competicaoId = resposta.body.id;
    idsCompeticoes.push(competicaoId);
    idBimestre1 = resposta.body.bimestres.find(
      (b: { numero: number }) => b.numero === 1,
    ).id;
    idBimestre2 = resposta.body.bimestres.find(
      (b: { numero: number }) => b.numero === 2,
    ).id;
  });

  let idCpProva1 = '';

  it('cria componentes de pontuação (Matemática 30+70, Português 40)', async () => {
    const p1 = await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componenteCurricularId: materiaMat, nome: 'Prova 1', pesoPercentual: 30 })
      .expect(201);
    expect(p1.body).toMatchObject({
      bimestreId: idBimestre1,
      componenteCurricularId: materiaMat,
      nome: 'Prova 1',
    });
    expect(p1.body.pesoPercentual).toBe(30);
    idCpProva1 = p1.body.id;

    await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componenteCurricularId: materiaMat, nome: 'Prova 2', pesoPercentual: 70 })
      .expect(201);

    const redacao = await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componenteCurricularId: materiaPor, nome: 'Redação', pesoPercentual: 40 })
      .expect(201);
    expect(redacao.body.componenteCurricularId).toBe(materiaPor);
  });

  it('lista componentes agrupados por matéria com soma de pesos', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body.bimestreId).toBe(idBimestre1);
    expect(resposta.body.todasFechadas).toBe(false);
    const mat = resposta.body.materias.find(
      (m: { componenteCurricularId: string }) => m.componenteCurricularId === materiaMat,
    );
    const por = resposta.body.materias.find(
      (m: { componenteCurricularId: string }) => m.componenteCurricularId === materiaPor,
    );
    expect(mat.somaPesoPercentual).toBe(100);
    expect(mat.componentesPontuacao).toHaveLength(2);
    expect(por.somaPesoPercentual).toBe(40);
  });

  it('validar aponta a matéria que ainda não fecha 100%', async () => {
    const resposta = await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao/validar`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(201);

    expect(resposta.body.fechado).toBe(false);
    expect(resposta.body.materiasPendentes).toHaveLength(1);
    expect(resposta.body.materiasPendentes[0]).toMatchObject({
      componenteCurricularId: materiaPor,
      somaPesoPercentual: 40,
      faltaParaFechar: 60,
    });
  });

  it('completando Português, validar confirma 100%', async () => {
    await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componenteCurricularId: materiaPor, nome: 'Leitura', pesoPercentual: 60 })
      .expect(201);

    const validar = await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao/validar`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(201);
    expect(validar.body.fechado).toBe(true);
    expect(validar.body.materiasPendentes).toEqual([]);

    const lista = await request(app.getHttpServer())
      .get(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);
    expect(lista.body.todasFechadas).toBe(true);
  });

  it('peso que ultrapassaria 100% da matéria é rejeitado (400)', async () => {
    await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componenteCurricularId: materiaMat, nome: 'Prova Extra', pesoPercentual: 10 })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componenteCurricularId: materiaMat, nome: 'Prova Extra', pesoPercentual: 0 })
      .expect(400);
  });

  it('matéria de outro lecionamento é rejeitada (400/404)', async () => {
    await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componenteCurricularId: materiaNum, nome: 'Intruso', pesoPercentual: 50 })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        componenteCurricularId: '00000000-0000-0000-0000-999999999999',
        nome: 'Fantasma',
        pesoPercentual: 50,
      })
      .expect(404);
  });

  it('professor não-dono não acessa componentes do bimestre (403)', async () => {
    await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.fora}`)
      .send({ componenteCurricularId: materiaMat, nome: 'Alheio', pesoPercentual: 50 })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/bimestres/${idBimestre1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.numerico}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre1}/componentes-pontuacao/validar`)
      .set('Authorization', `Bearer ${tokens.fora}`)
      .expect(403);
  });

  it('lote cria notas de vários alunos em uma chamada', async () => {
    const resposta = await request(app.getHttpServer())
      .post(`/componentes-pontuacao/${idCpProva1}/lancamentos/lote`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        lancamentos: [
          { alunoId: idsAlunosSala[0], valorNoModelo: 'MB' },
          { alunoId: idsAlunosSala[1], valorNoModelo: 'R' },
          { alunoId: idsAlunosSala[2], valorNoModelo: 'B' },
        ],
      })
      .expect(201);

    expect(resposta.body).toHaveLength(3);

    const lista = await request(app.getHttpServer())
      .get(`/componentes-pontuacao/${idCpProva1}/lancamentos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);
    expect(lista.body).toHaveLength(3);
    const valores = lista.body.map((l: { valorNoModelo: string }) => l.valorNoModelo).sort();
    expect(valores).toEqual(['B', 'MB', 'R']);
  });

  it('relançar nota atualiza (upsert) sem duplicar', async () => {
    await request(app.getHttpServer())
      .post(`/componentes-pontuacao/${idCpProva1}/lancamentos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ alunoId: idsAlunosSala[0], valorNoModelo: 'I' })
      .expect(201);

    const lista = await request(app.getHttpServer())
      .get(`/componentes-pontuacao/${idCpProva1}/lancamentos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);
    expect(lista.body).toHaveLength(3);
    const aluno1 = lista.body.find(
      (l: { aluno: { id: string } }) => l.aluno.id === idsAlunosSala[0],
    );
    expect(aluno1.valorNoModelo).toBe('I');
  });

  it('valor fora da escala conceitual retorna 400', async () => {
    await request(app.getHttpServer())
      .post(`/componentes-pontuacao/${idCpProva1}/lancamentos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ alunoId: idsAlunosSala[1], valorNoModelo: 'X' })
      .expect(400);
  });

  it('aluno de outra sala não recebe nota (400)', async () => {
    await request(app.getHttpServer())
      .post(`/componentes-pontuacao/${idCpProva1}/lancamentos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ alunoId: alunoNumId, valorNoModelo: 'B' })
      .expect(400);
  });

  it('bimestre encerrado rejeita lançamento (409)', async () => {
    const componenteB2 = await request(app.getHttpServer())
      .post(`/bimestres/${idBimestre2}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componenteCurricularId: materiaMat, nome: 'Prova B2', pesoPercentual: 100 })
      .expect(201);

    await prisma.bimestre.update({
      where: { id: idBimestre2 },
      data: { situacao: 'ENCERRADO' },
    });

    await request(app.getHttpServer())
      .post(`/componentes-pontuacao/${componenteB2.body.id}/lancamentos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ alunoId: idsAlunosSala[0], valorNoModelo: 'B' })
      .expect(409);
  });

  it('cria competição numérica e rejeita nota fora da escala', async () => {
    const competicao = await request(app.getHttpServer())
      .post('/competicoes')
      .set('Authorization', `Bearer ${tokens.numerico}`)
      .send({
        nome: 'Numerica 2026',
        lecionamentoId: lecionamentoNumId,
        bimestres: bimestresDeCompeticao(),
      })
      .expect(201);
    competicaoNumId = competicao.body.id;
    idsCompeticoes.push(competicaoNumId);
    idBimestreNum1 = competicao.body.bimestres.find(
      (b: { numero: number }) => b.numero === 1,
    ).id;

    const componente = await request(app.getHttpServer())
      .post(`/bimestres/${idBimestreNum1}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.numerico}`)
      .send({ componenteCurricularId: materiaNum, nome: 'Prova Numérica', pesoPercentual: 100 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/componentes-pontuacao/${componente.body.id}/lancamentos`)
      .set('Authorization', `Bearer ${tokens.numerico}`)
      .send({ alunoId: alunoNumId, valorNoModelo: '8.5' })
      .expect(201);

    for (const invalido of ['11', 'X', '8,5', '0', '8.567']) {
      await request(app.getHttpServer())
        .post(`/componentes-pontuacao/${componente.body.id}/lancamentos`)
        .set('Authorization', `Bearer ${tokens.numerico}`)
        .send({ alunoId: alunoNumId, valorNoModelo: invalido })
        .expect(400);
    }

    const lista = await request(app.getHttpServer())
      .get(`/componentes-pontuacao/${componente.body.id}/lancamentos`)
      .set('Authorization', `Bearer ${tokens.numerico}`)
      .expect(200);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].valorNoModelo).toBe('8.5');
  });
});