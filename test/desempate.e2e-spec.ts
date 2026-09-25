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

describe('Desempate (e2e)', () => {
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
        nome: 'Escola Numerica Desempate (E2E)',
        modeloAvaliacaoId: ID_MODELO_NUMERICO,
      },
    });
    idsEscolas.push(escolaNumerica.id);
    escolaNumericaId = escolaNumerica.id;

    const escolaFora = await prisma.escola.create({
      data: {
        nome: 'Escola Fora Desempate (E2E)',
        modeloAvaliacaoId: ID_MODELO_NUMERICO,
      },
    });
    idsEscolas.push(escolaFora.id);

    tokens.principal = (await criarProfessorCredenciado(
      'Professor Desempate (E2E)',
      escolaNumericaId,
    )).token;
    tokens.fora = (await criarProfessorCredenciado(
      'Professor Fora Desempate (E2E)',
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
  const idsAlunosSala: string[] = [];

  interface NotasDoBimestre {
    alfa: { mat: number; por: number };
    beta: { mat: number; por: number };
  }

  async function prepararBimestre(
    bimestreId: string,
    notas: NotasDoBimestre,
  ): Promise<void> {
    const criarComponente = async (
      nome: string,
      componenteCurricularId: string,
    ): Promise<string> => {
      const resposta = await request(app.getHttpServer())
        .post(`/bimestres/${bimestreId}/componentes-pontuacao`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ componenteCurricularId, nome, pesoPercentual: 100 })
        .expect(201);
      return resposta.body.id as string;
    };

    const prova = await criarComponente('Prova', materiaMat);
    const redacao = await criarComponente('Redação', materiaPor);

    const pares: Array<[string, { mat: number; por: number }]> = [
      [idsAlunosSala[0], notas.alfa],
      [idsAlunosSala[1], notas.beta],
    ];
    for (const [alunoId, notasDoAluno] of pares) {
      await request(app.getHttpServer())
        .post(`/componentes-pontuacao/${prova}/lancamentos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ alunoId, valorNoModelo: String(notasDoAluno.mat) })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/componentes-pontuacao/${redacao}/lancamentos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ alunoId, valorNoModelo: String(notasDoAluno.por) })
        .expect(201);
    }
  }

  async function encerrar(bimestreId: string): Promise<request.Response> {
    return request(app.getHttpServer())
      .post(`/bimestres/${bimestreId}/encerrar`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(201);
  }

  it('fluxo: cria sala, competição, grupos e membros', async () => {
    const sala = await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ nome: '3º C (Desempate)', anoLetivo: ANO, escolaId: escolaNumericaId })
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

    for (const nome of ['Sol', 'Luna']) {
      const aluno = await request(app.getHttpServer())
        .post(`/salas/${salaId}/alunos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ nome: `Aluno ${nome} (E2E)` })
        .expect(201);
      idsAlunos.push(aluno.body.codigoMatricula);
      idsAlunosSala.push(aluno.body.id);
    }

    const competicao = await request(app.getHttpServer())
      .post('/competicoes')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        nome: 'Torneio Desempate 2026',
        lecionamentoId,
        bimestres: bimestresDeCompeticao(),
      })
      .expect(201);
    competicaoId = competicao.body.id;
    idsCompeticoes.push(competicaoId);
    idsBimestres.push(
      ...competicao.body.bimestres.map((b: { id: string }) => b.id),
    );

    for (const nome of ['Grupo Alfa', 'Grupo Beta']) {
      const grupo = await request(app.getHttpServer())
        .post(`/competicoes/${competicaoId}/grupos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ nome })
        .expect(201);
      if (nome === 'Grupo Alfa') grupoAlfa = grupo.body.id;
      else grupoBeta = grupo.body.id;
    }

    for (const bimestreId of idsBimestres) {
      await request(app.getHttpServer())
        .post(`/grupos/${grupoAlfa}/membros`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ alunoId: idsAlunosSala[0], bimestreId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/grupos/${grupoBeta}/membros`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ alunoId: idsAlunosSala[1], bimestreId })
        .expect(201);
    }
  }, 90000);

  it('encerra o bimestre 1 com 2 grupos empatados e sinaliza o empate', async () => {
    // Alfa (9/7) = 8, Beta (8/8) = 8: empate no grupo, mas Matemática
    // favorece o Alfa (9 > 8) e Português o Beta (8 > 7).
    await prepararBimestre(idsBimestres[0], {
      alfa: { mat: 9, por: 7 },
      beta: { mat: 8, por: 8 },
    });
    const encerramento = await encerrar(idsBimestres[0]);

    expect(encerramento.body.empates).toHaveLength(1);
    expect(encerramento.body.empates[0]).toMatchObject({
      bimestreId: idsBimestres[0],
      valor: 8,
    });
    expect(
      encerramento.body.empates[0].grupos.map((g: { grupoId: string }) => g.grupoId),
    ).toEqual([grupoAlfa, grupoBeta]);
  }, 90000);

  it('pendencias lista o empate parcial e o empate anual ainda em aberto', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/desempate/pendencias`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body).toHaveLength(2);
    expect(resposta.body[0]).toMatchObject({
      tipo: 'parcial',
      bimestreId: idsBimestres[0],
      valor: 8,
    });
    expect(resposta.body[0].grupos).toEqual([
      { grupoId: grupoAlfa, nome: 'Grupo Alfa', valor: 8 },
      { grupoId: grupoBeta, nome: 'Grupo Beta', valor: 8 },
    ]);
    expect(resposta.body[1]).toMatchObject({
      tipo: 'anual',
      bimestreId: null,
      valor: 8,
    });
  });

  it('desempate manual redefine a ordem do ranking parcial', async () => {
    const resposta = await request(app.getHttpServer())
      .post(`/competicoes/${competicaoId}/desempate`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        bimestreId: idsBimestres[0],
        ordem: [
          { grupoId: grupoBeta, posicao: 1 },
          { grupoId: grupoAlfa, posicao: 2 },
        ],
      })
      .expect(201);

    expect(resposta.body).toMatchObject({
      bimestreId: idsBimestres[0],
      desempates: [
        { grupoId: grupoBeta, posicao: 1, origem: 'MANUAL' },
        { grupoId: grupoAlfa, posicao: 2, origem: 'MANUAL' },
      ],
    });

    const ranking = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking?bimestreId=${idsBimestres[0]}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(ranking.body.itens).toEqual([
      { posicao: 1, grupoId: grupoBeta, nome: 'Grupo Beta', valor: 8, empate: false },
      { posicao: 2, grupoId: grupoAlfa, nome: 'Grupo Alfa', valor: 8, empate: false },
    ]);
  });

  it('empate manual resolvido sai das pendencias; posicao duplicada é rejeitada', async () => {
    const pendencias = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/desempate/pendencias`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(pendencias.body.every((p: { bimestreId: string | null }) => p.bimestreId !== idsBimestres[0])).toBe(true);

    await request(app.getHttpServer())
      .post(`/competicoes/${competicaoId}/desempate`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        bimestreId: idsBimestres[0],
        ordem: [
          { grupoId: grupoAlfa, posicao: 1 },
          { grupoId: grupoBeta, posicao: 1 },
        ],
      })
      .expect(400);
  });

  it('encerra o bimestre 2 com empate para o critério automático parcial', async () => {
    await prepararBimestre(idsBimestres[1], {
      alfa: { mat: 9, por: 7 },
      beta: { mat: 8, por: 8 },
    });
    const encerramento = await encerrar(idsBimestres[1]);
    expect(encerramento.body.empates).toHaveLength(1);
  }, 90000);

  it('critério automático parcial desempata pela matéria de maior peso', async () => {
    const resposta = await request(app.getHttpServer())
      .post(`/competicoes/${competicaoId}/desempate/aplicar-automatico?bimestreId=${idsBimestres[1]}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(201);

    expect(resposta.body).toMatchObject({
      bimestreId: idsBimestres[1],
      aplicados: 1,
      desempates: [
        { grupoId: grupoAlfa, posicao: 1, origem: 'AUTOMATICO' },
        { grupoId: grupoBeta, posicao: 2, origem: 'AUTOMATICO' },
      ],
      residuais: [],
    });

    const ranking = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking?bimestreId=${idsBimestres[1]}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(ranking.body.itens).toEqual([
      { posicao: 1, grupoId: grupoAlfa, nome: 'Grupo Alfa', valor: 8, empate: false },
      { posicao: 2, grupoId: grupoBeta, nome: 'Grupo Beta', valor: 8, empate: false },
    ]);
  });

  it('empate residual após todas as matérias mantém a posição e o sinal de empate', async () => {
    await prepararBimestre(idsBimestres[2], {
      alfa: { mat: 7, por: 7 },
      beta: { mat: 7, por: 7 },
    });
    await encerrar(idsBimestres[2]);

    const automatico = await request(app.getHttpServer())
      .post(`/competicoes/${competicaoId}/desempate/aplicar-automatico?bimestreId=${idsBimestres[2]}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(201);

    expect(automatico.body).toMatchObject({
      aplicados: 0,
      desempates: [],
    });
    expect(automatico.body.residuais).toHaveLength(1);
    expect(automatico.body.residuais[0].grupos.map((g: { grupoId: string }) => g.grupoId)).toEqual([
      grupoAlfa,
      grupoBeta,
    ]);

    const ranking = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking?bimestreId=${idsBimestres[2]}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(ranking.body.itens).toEqual([
      { posicao: 1, grupoId: grupoAlfa, nome: 'Grupo Alfa', valor: 7, empate: true },
      { posicao: 1, grupoId: grupoBeta, nome: 'Grupo Beta', valor: 7, empate: true },
    ]);
  }, 90000);

  it('encerra o bimestre 4 para fechar o ranking anual', async () => {
    await prepararBimestre(idsBimestres[3], {
      alfa: { mat: 10, por: 6 },
      beta: { mat: 10, por: 6 },
    });
    const encerramento = await encerrar(idsBimestres[3]);
    expect(encerramento.body.competicaoConcluida).toBe(true);
    // Alfa 8+8+7+8 = 31 e Beta 31: empate anual.
    expect(encerramento.body.empates).toHaveLength(1);
  }, 90000);

  it('critério automático anual desempata com todas as matérias dos bimestres', async () => {
    const resposta = await request(app.getHttpServer())
      .post(`/competicoes/${competicaoId}/desempate/aplicar-automatico`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(201);

    expect(resposta.body).toMatchObject({
      bimestreId: null,
      aplicados: 1,
    });
    expect(resposta.body.desempates).toEqual([
      { grupoId: grupoAlfa, posicao: 1, origem: 'AUTOMATICO' },
      { grupoId: grupoBeta, posicao: 2, origem: 'AUTOMATICO' },
    ]);

    const ranking = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/ranking`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(ranking.body).toMatchObject({
      tipo: 'anual',
      bimestresEncerrados: 4,
      completo: true,
    });
    expect(ranking.body.itens).toEqual([
      { posicao: 1, grupoId: grupoAlfa, nome: 'Grupo Alfa', valor: 31, empate: false },
      { posicao: 2, grupoId: grupoBeta, nome: 'Grupo Beta', valor: 31, empate: false },
    ]);
  });

  it('pendencias final: sobra apenas os empates residuais (bimestres 3 e 4)', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/desempate/pendencias`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    // O empate anual e os parciais 1 e 2 foram resolvidos; os empates reais
    // (bimestres 3 e 4) persistem como pendência, sem desempate gravado.
    expect(resposta.body).toHaveLength(2);
    expect(resposta.body[0]).toMatchObject({
      tipo: 'parcial',
      bimestreId: idsBimestres[2],
      valor: 7,
    });
    expect(resposta.body[1]).toMatchObject({
      tipo: 'parcial',
      bimestreId: idsBimestres[3],
      valor: 8,
    });
  });

  it('professor de outra escola não acessa pendencias nem desempata (403)', async () => {
    await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/desempate/pendencias`)
      .set('Authorization', `Bearer ${tokens.fora}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/competicoes/${competicaoId}/desempate`)
      .set('Authorization', `Bearer ${tokens.fora}`)
      .send({
        bimestreId: idsBimestres[0],
        ordem: [{ grupoId: grupoAlfa, posicao: 1 }],
      })
      .expect(403);
  });
});