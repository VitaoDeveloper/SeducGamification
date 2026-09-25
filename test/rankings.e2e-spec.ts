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

describe('Rankings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const idsAlunos: string[] = [];
  const idsSalas: string[] = [];
  const idsEscolas: string[] = [];
  const idsProfessores: string[] = [];
  const idsLecionamentos: string[] = [];
  const idsCompeticoes: string[] = [];

  const tokens = { principal: '', fora: '' };

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

  let escolaNumericaId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const escolaNumerica = await prisma.escola.create({
      data: {
        nome: 'Escola Numerica Rankings (E2E)',
        modeloAvaliacaoId: ID_MODELO_NUMERICO,
      },
    });
    idsEscolas.push(escolaNumerica.id);
    escolaNumericaId = escolaNumerica.id;

    const escolaFora = await prisma.escola.create({
      data: {
        nome: 'Escola Fora Rankings (E2E)',
        modeloAvaliacaoId: ID_MODELO_NUMERICO,
      },
    });
    idsEscolas.push(escolaFora.id);

    tokens.principal = (await criarProfessorCredenciado(
      'Professor Rankings (E2E)',
      escolaNumericaId,
    )).token;
    tokens.fora = (await criarProfessorCredenciado(
      'Professor Fora Rankings (E2E)',
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

  let salaId: string;
  let lecionamentoId: string;
  let materiaMat = '';
  let materiaPor = '';
  let competicaoId: string;
  const idsBimestres: string[] = [];
  let grupoAlfa = '';
  let grupoBeta = '';
  let grupoGama = '';
  const idsAlunosSala: string[] = [];
  const nomesAlunos = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eva', 'Fábio'];

  it('fluxo: cria sala numérica com 2 matérias e 6 alunos', async () => {
    const sala = await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ nome: '3º C (Rankings)', anoLetivo: ANO, escolaId: escolaNumericaId })
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

    for (const nome of nomesAlunos) {
      const aluno = await request(app.getHttpServer())
        .post(`/salas/${salaId}/alunos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ nome: `Aluno ${nome} (E2E)` })
        .expect(201);
      idsAlunos.push(aluno.body.codigoMatricula);
      idsAlunosSala.push(aluno.body.id);
    }
  });

  it('cria competição, 3 grupos e distribui os alunos nos 4 bimestres', async () => {
    const competicao = await request(app.getHttpServer())
      .post('/competicoes')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        nome: 'Torneio Rankings 2026',
        lecionamentoId,
        bimestres: bimestresDeCompeticao(),
      })
      .expect(201);
    competicaoId = competicao.body.id;
    idsCompeticoes.push(competicaoId);
    idsBimestres.push(
      ...competicao.body.bimestres.map((b: { id: string }) => b.id),
    );

    for (const [i, nome] of ['Grupo Alfa', 'Grupo Beta', 'Grupo Gama'].entries()) {
      const grupo = await request(app.getHttpServer())
        .post(`/competicoes/${competicaoId}/grupos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ nome })
        .expect(201);
      if (i === 0) grupoAlfa = grupo.body.id;
      if (i === 1) grupoBeta = grupo.body.id;
      if (i === 2) grupoGama = grupo.body.id;
    }

    for (const bimestreId of idsBimestres) {
      const gruposPorIntegrante: string[][] = [
        [grupoAlfa, grupoAlfa],
        [grupoBeta, grupoBeta],
        [grupoGama, grupoGama],
      ];
      for (let aluno = 0; aluno < 6; aluno++) {
        const grupo = gruposPorIntegrante[Math.floor(aluno / 2)][aluno % 2];
        await request(app.getHttpServer())
          .post(`/grupos/${grupo}/membros`)
          .set('Authorization', `Bearer ${tokens.principal}`)
          .send({ alunoId: idsAlunosSala[aluno], bimestreId })
          .expect(201);
      }
    }
  }, 60000);

  it('ranking antes de qualquer encerramento retorna vazio e parcial', async () => {
    const anual = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);
    expect(anual.body).toMatchObject({
      tipo: 'anual',
      bimestreId: null,
      bimestresEncerrados: 0,
      completo: false,
      itens: [],
    });

    const individual = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking-individual`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);
    expect(individual.body.itens).toEqual([]);
  });

  // bimestre 1: Alfa (10/9) = 9.5, Beta (8/8) = 8, Gama (7/6) = 6.5.
  // bimestres 2 a 4: Alfa (8/8) = 8, Beta (8/8) = 8, Gama (6/6) = 6.
  async function prepararBimestre(
    bimestreId: string,
    notas: number[],
  ): Promise<void> {
    const criarComponente = async (
      nome: string,
      componenteCurricularId: string,
      pesoPercentual: number,
    ): Promise<string> => {
      const resposta = await request(app.getHttpServer())
        .post(`/bimestres/${bimestreId}/componentes-pontuacao`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ componenteCurricularId, nome, pesoPercentual })
        .expect(201);
      return resposta.body.id as string;
    };

    const prova = await criarComponente('Prova', materiaMat, 100);
    const redacao = await criarComponente('Redação', materiaPor, 100);

    for (let aluno = 0; aluno < notas.length; aluno++) {
      const valor = String(notas[aluno]);
      for (const componentePontuacaoId of [prova, redacao]) {
        await request(app.getHttpServer())
          .post(`/componentes-pontuacao/${componentePontuacaoId}/lancamentos`)
          .set('Authorization', `Bearer ${tokens.principal}`)
          .send({ alunoId: idsAlunosSala[aluno], valorNoModelo: valor })
          .expect(201);
      }
    }
  }

  it('encerra o bimestre 1', async () => {
    await prepararBimestre(idsBimestres[0], [10, 9, 8, 8, 7, 6]);
    await request(app.getHttpServer())
      .post(`/bimestres/${idsBimestres[0]}/encerrar`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(201);
  }, 60000);

  it('ranking parcial do bimestre 1 ordena grupos distintos sem empate', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking?bimestreId=${idsBimestres[0]}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body).toMatchObject({
      tipo: 'parcial',
      competicaoId,
      bimestreId: idsBimestres[0],
      bimestresEncerrados: 1,
      completo: false,
    });
    expect(resposta.body.itens).toEqual([
      {
        posicao: 1,
        grupoId: grupoAlfa,
        nome: 'Grupo Alfa',
        valor: 9.5,
        empate: false,
      },
      {
        posicao: 2,
        grupoId: grupoBeta,
        nome: 'Grupo Beta',
        valor: 8,
        empate: false,
      },
      {
        posicao: 3,
        grupoId: grupoGama,
        nome: 'Grupo Gama',
        valor: 6.5,
        empate: false,
      },
    ]);
  });

  it('encerra o bimestre 2', async () => {
    await prepararBimestre(idsBimestres[1], [8, 8, 8, 8, 6, 6]);
    await request(app.getHttpServer())
      .post(`/bimestres/${idsBimestres[1]}/encerrar`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(201);
  }, 60000);

  it('ranking parcial do bimestre 2 marca empate entre Alfa e Beta', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking?bimestreId=${idsBimestres[1]}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body).toMatchObject({
      tipo: 'parcial',
      bimestreId: idsBimestres[1],
      bimestresEncerrados: 2,
      completo: false,
    });
    expect(resposta.body.itens).toEqual([
      {
        posicao: 1,
        grupoId: grupoAlfa,
        nome: 'Grupo Alfa',
        valor: 8,
        empate: true,
      },
      {
        posicao: 1,
        grupoId: grupoBeta,
        nome: 'Grupo Beta',
        valor: 8,
        empate: true,
      },
      {
        posicao: 3,
        grupoId: grupoGama,
        nome: 'Grupo Gama',
        valor: 6,
        empate: false,
      },
    ]);
  });

  it('ranking anual parcial soma os bimestres encerrados', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body).toMatchObject({
      tipo: 'anual',
      bimestreId: null,
      bimestresEncerrados: 2,
      completo: false,
    });
    expect(resposta.body.itens).toEqual([
      {
        posicao: 1,
        grupoId: grupoAlfa,
        nome: 'Grupo Alfa',
        valor: 17.5,
        empate: false,
      },
      {
        posicao: 2,
        grupoId: grupoBeta,
        nome: 'Grupo Beta',
        valor: 16,
        empate: false,
      },
      {
        posicao: 3,
        grupoId: grupoGama,
        nome: 'Grupo Gama',
        valor: 12.5,
        empate: false,
      },
    ]);
  });

  it('ranking individual parcial tem a média dos bimestres encerrados', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking-individual`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body).toMatchObject({
      tipo: 'individual',
      bimestresEncerrados: 2,
      completo: false,
    });
    expect(resposta.body.itens).toEqual([
      { posicao: 1, alunoId: idsAlunosSala[0], nome: 'Aluno Ana (E2E)', valor: 9, empate: false },
      { posicao: 2, alunoId: idsAlunosSala[1], nome: 'Aluno Bruno (E2E)', valor: 8.5, empate: false },
      { posicao: 3, alunoId: idsAlunosSala[2], nome: 'Aluno Carla (E2E)', valor: 8, empate: true },
      { posicao: 3, alunoId: idsAlunosSala[3], nome: 'Aluno Diego (E2E)', valor: 8, empate: true },
      { posicao: 5, alunoId: idsAlunosSala[4], nome: 'Aluno Eva (E2E)', valor: 6.5, empate: false },
      { posicao: 6, alunoId: idsAlunosSala[5], nome: 'Aluno Fábio (E2E)', valor: 6, empate: false },
    ]);
  });

  it('encerra os bimestres 3 e 4', async () => {
    for (const bimestreId of idsBimestres.slice(2)) {
      await prepararBimestre(bimestreId, [8, 8, 8, 8, 6, 6]);
      await request(app.getHttpServer())
        .post(`/bimestres/${bimestreId}/encerrar`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .expect(201);
    }
  }, 60000);

  it('ranking anual completo soma as 4 sínteses', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body).toMatchObject({
      tipo: 'anual',
      bimestreId: null,
      bimestresEncerrados: 4,
      completo: true,
    });
    expect(resposta.body.itens).toEqual([
      {
        posicao: 1,
        grupoId: grupoAlfa,
        nome: 'Grupo Alfa',
        valor: 33.5,
        empate: false,
      },
      {
        posicao: 2,
        grupoId: grupoBeta,
        nome: 'Grupo Beta',
        valor: 32,
        empate: false,
      },
      {
        posicao: 3,
        grupoId: grupoGama,
        nome: 'Grupo Gama',
        valor: 24.5,
        empate: false,
      },
    ]);
  });

  it('ranking individual completo depois dos 4 bimestres', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking-individual`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body.completo).toBe(true);
    expect(resposta.body.itens).toEqual([
      { posicao: 1, alunoId: idsAlunosSala[0], nome: 'Aluno Ana (E2E)', valor: 8.5, empate: false },
      { posicao: 2, alunoId: idsAlunosSala[1], nome: 'Aluno Bruno (E2E)', valor: 8.25, empate: false },
      { posicao: 3, alunoId: idsAlunosSala[2], nome: 'Aluno Carla (E2E)', valor: 8, empate: true },
      { posicao: 3, alunoId: idsAlunosSala[3], nome: 'Aluno Diego (E2E)', valor: 8, empate: true },
      { posicao: 5, alunoId: idsAlunosSala[4], nome: 'Aluno Eva (E2E)', valor: 6.25, empate: false },
      { posicao: 6, alunoId: idsAlunosSala[5], nome: 'Aluno Fábio (E2E)', valor: 6, empate: false },
    ]);
  });

  it('professor de outra escola não consulta os rankings (403)', async () => {
    for (const rota of ['ranking', 'ranking-individual']) {
      await request(app.getHttpServer())
        .get(`/competicoes/${competicaoId}/${rota}`)
        .set('Authorization', `Bearer ${tokens.fora}`)
        .expect(403);
    }
  });
});