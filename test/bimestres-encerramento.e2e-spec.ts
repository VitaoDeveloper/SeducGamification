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

// Notas do bimestre, no modelo numérico, escolhidas para deixar o bimestre 1
// com um empate entre os dois grupos:
//
//   aluno | Prova 50% | Trabalho 50% | S(mat) | Redação 100% | S(por) | S(b)
//   Ana   |    8      |     10       |   9    |      9      |   9    |  9
//   Bruno |    8      |  sem nota    |   4    |      6      |   6    |  5
//   Carla |    8      |      8       |   8    |      8      |   8    |  8
//   Diego |   10      |      8       |   9    |      3      |   3    |  6
//
// Alfa = (9 + 5) / 2 = 7 e Beta = (8 + 6) / 2 = 7  ->  empate em 7.
const NOTAS: ReadonlyArray<{
  indice: number;
  prova: string;
  trabalho: string | null;
  redacao: string;
  sinteseMateria: number;
  sintesePortugues: number;
  sinteseBimestral: number;
}> = [
  {
    indice: 0,
    prova: '8',
    trabalho: '10',
    redacao: '9',
    sinteseMateria: 9,
    sintesePortugues: 9,
    sinteseBimestral: 9,
  },
  {
    indice: 1,
    prova: '8',
    trabalho: null,
    redacao: '6',
    sinteseMateria: 4,
    sintesePortugues: 6,
    sinteseBimestral: 5,
  },
  {
    indice: 2,
    prova: '8',
    trabalho: '8',
    redacao: '8',
    sinteseMateria: 8,
    sintesePortugues: 8,
    sinteseBimestral: 8,
  },
  {
    indice: 3,
    prova: '10',
    trabalho: '8',
    redacao: '3',
    sinteseMateria: 9,
    sintesePortugues: 3,
    sinteseBimestral: 6,
  },
];

const SINTESE_GRUPO = 7;
const PONTUACAO_FINAL_GRUPO = SINTESE_GRUPO * 4;

function dataIso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function bimestresDeCompeticao() {
  return [
    {
      numero: 1,
      dataInicio: dataIso(ANO, 2, 2),
      dataFim: dataIso(ANO, 4, 24),
    },
    {
      numero: 2,
      dataInicio: dataIso(ANO, 4, 27),
      dataFim: dataIso(ANO, 7, 3),
    },
    {
      numero: 3,
      dataInicio: dataIso(ANO, 8, 3),
      dataFim: dataIso(ANO, 10, 2),
    },
    {
      numero: 4,
      dataInicio: dataIso(ANO, 10, 5),
      dataFim: dataIso(ANO, 12, 18),
    },
  ];
}

interface Encerramento {
  body: {
    bimestreId: string;
    numero: number;
    situacao: string;
    encerradoEm: string;
    totais: { alunos: number; materias: number; grupos: number };
    sinteseAlunoComponente: Array<{
      alunoId: string;
      componenteCurricularId: string;
      materiaNome: string;
      valor: number;
    }>;
    sinteseAluno: Array<{ alunoId: string; nome: string; valor: number }>;
    sinteseGrupo: Array<{
      grupoId: string;
      nome: string;
      integrantes: number;
      valor: number;
    }>;
    gruposSemIntegrantes: Array<{ grupoId: string; nome: string }>;
    empates: Array<{
      bimestreId: string;
      valor: number;
      grupos: Array<{ grupoId: string; nome: string; valor: number }>;
    }>;
    competicaoConcluida: boolean;
    pontuacoesFinais: {
      alunos: Array<{ alunoId: string; nome: string; valor: number }>;
      grupos: Array<{ grupoId: string; nome: string; valor: number }>;
    } | null;
  };
}

describe('Encerramento de bimestre (e2e)', () => {
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
        nome: 'Escola Numerica Encerramento (E2E)',
        modeloAvaliacaoId: ID_MODELO_NUMERICO,
      },
    });
    idsEscolas.push(escolaNumerica.id);
    escolaNumericaId = escolaNumerica.id;

    const escolaFora = await prisma.escola.create({
      data: {
        nome: 'Escola Fora Encerramento (E2E)',
        modeloAvaliacaoId: ID_MODELO_NUMERICO,
      },
    });
    idsEscolas.push(escolaFora.id);

    tokens.principal = (await criarProfessorCredenciado(
      'Professor Encerramento (E2E)',
      escolaNumericaId,
    )).token;
    tokens.fora = (await criarProfessorCredenciado(
      'Professor Fora Encerramento (E2E)',
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
  const componentesPorBimestre = new Map<
    string,
    { prova: string; trabalho: string; redacao: string }
  >();

  it('fluxo: cria sala numérica com 2 matérias e 4 alunos', async () => {
    const sala = await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ nome: '3º C (Encerramento)', anoLetivo: ANO, escolaId: escolaNumericaId })
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

    for (const nome of ['Ana', 'Bruno', 'Carla', 'Diego']) {
      const aluno = await request(app.getHttpServer())
        .post(`/salas/${salaId}/alunos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ nome: `Aluno ${nome} (E2E)` })
        .expect(201);
      idsAlunos.push(aluno.body.codigoMatricula);
      idsAlunosSala.push(aluno.body.id);
    }
  });

  it('cria competição com 4 bimestres, 2 grupos e distribui os alunos', async () => {
    const competicao = await request(app.getHttpServer())
      .post('/competicoes')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        nome: 'Torneio Encerramento 2026',
        lecionamentoId,
        bimestres: bimestresDeCompeticao(),
      })
      .expect(201);
    competicaoId = competicao.body.id;
    idsCompeticoes.push(competicaoId);
    idsBimestres.push(
      ...competicao.body.bimestres.map((b: { id: string }) => b.id),
    );
    expect(idsBimestres).toHaveLength(4);

    for (const nome of ['Grupo Alfa', 'Grupo Beta']) {
      const grupo = await request(app.getHttpServer())
        .post(`/competicoes/${competicaoId}/grupos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ nome })
        .expect(201);
      if (nome === 'Grupo Alfa') {
        grupoAlfa = grupo.body.id;
      } else {
        grupoBeta = grupo.body.id;
      }
    }

    // Mesma composição nos quatro bimestres (RN9).
    for (const bimestreId of idsBimestres) {
      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer())
          .post(`/grupos/${i < 2 ? grupoAlfa : grupoBeta}/membros`)
          .set('Authorization', `Bearer ${tokens.principal}`)
          .send({ alunoId: idsAlunosSala[i], bimestreId })
          .expect(201);
      }
    }
  });

  async function prepararBimestre(bimestreId: string): Promise<void> {
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

    const prova = await criarComponente('Prova', materiaMat, 50);
    const trabalho = await criarComponente('Trabalho', materiaMat, 50);
    const redacao = await criarComponente('Redação', materiaPor, 100);
    componentesPorBimestre.set(bimestreId, { prova, trabalho, redacao });

    for (const nota of NOTAS) {
      const alunoId = idsAlunosSala[nota.indice];
      const lancamentos: Array<[string, string]> = [
        [prova, nota.prova],
        [redacao, nota.redacao],
      ];
      if (nota.trabalho) {
        lancamentos.push([trabalho, nota.trabalho]);
      }

      for (const [componentePontuacaoId, valorNoModelo] of lancamentos) {
        await request(app.getHttpServer())
          .post(`/componentes-pontuacao/${componentePontuacaoId}/lancamentos`)
          .set('Authorization', `Bearer ${tokens.principal}`)
          .send({ alunoId, valorNoModelo })
          .expect(201);
      }
    }
  }

  it('encerrar com pesos incompletos retorna 400 e aponta a matéria pendente', async () => {
    const bimestreId = idsBimestres[0];

    for (const [nome, peso] of [
      ['Prova', 50],
      ['Trabalho', 50],
    ]) {
      await request(app.getHttpServer())
        .post(`/bimestres/${bimestreId}/componentes-pontuacao`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ componenteCurricularId: materiaMat, nome, pesoPercentual: peso })
        .expect(201);
    }

    // Português ainda está zerado: o encerramento tem de ser recusado.
    const semRedacao = await request(app.getHttpServer())
      .post(`/bimestres/${bimestreId}/encerrar`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(400);

    expect(semRedacao.body.message).toContain('Português');
    expect(semRedacao.body.materiasPendentes).toEqual([
      {
        componenteCurricularId: materiaPor,
        materiaNome: 'Português',
        somaPesoPercentual: 0,
        faltaParaFechar: 100,
      },
    ]);
    expect(
      (
        await prisma.bimestre.findUniqueOrThrow({
          where: { id: bimestreId },
          select: { situacao: true },
        })
      ).situacao,
    ).toBe('ABERTO');

    await request(app.getHttpServer())
      .post(`/bimestres/${bimestreId}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        componenteCurricularId: materiaPor,
        nome: 'Redação',
        pesoPercentual: 40,
      })
      .expect(201);

    const parcial = await request(app.getHttpServer())
      .post(`/bimestres/${bimestreId}/encerrar`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(400);

    expect(parcial.body.message).toContain('Português (40%)');
    expect(parcial.body.materiasPendentes[0]).toMatchObject({
      materiaNome: 'Português',
      somaPesoPercentual: 40,
      faltaParaFechar: 60,
    });
  });

  it('lança as notas do bimestre 1 (Bruno sem nota no Trabalho)', async () => {
    const bimestreId = idsBimestres[0];

    const antes = await request(app.getHttpServer())
      .get(`/bimestres/${bimestreId}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);
    expect(antes.body.todasFechadas).toBe(false);

    await request(app.getHttpServer())
      .post(`/bimestres/${bimestreId}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        componenteCurricularId: materiaPor,
        nome: 'Leitura',
        pesoPercentual: 60,
      })
      .expect(201);

    const lista = await request(app.getHttpServer())
      .get(`/bimestres/${bimestreId}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);
    expect(lista.body.todasFechadas).toBe(true);

    const componentes = new Map<string, string>();
    for (const materia of lista.body.materias) {
      for (const componente of materia.componentesPontuacao) {
        componentes.set(componente.nome, componente.id);
      }
    }
    // Guarda os ids dos componentes deste bimestre para os testes de congelamento.
    componentesPorBimestre.set(bimestreId, {
      prova: componentes.get('Prova')!,
      trabalho: componentes.get('Trabalho')!,
      redacao: componentes.get('Redação')!,
    });

    for (const nota of NOTAS) {
      const alunoId = idsAlunosSala[nota.indice];
      // Leitura leva a mesma nota da Redação: 40% + 60% = 100% da matéria.
      const lancamentos: Array<[string, string | null]> = [
        ['Prova', nota.prova],
        ['Trabalho', nota.trabalho],
        ['Redação', nota.redacao],
        ['Leitura', nota.redacao],
      ];

      for (const [nomeComponente, valor] of lancamentos) {
        if (!valor) {
          continue;
        }
        await request(app.getHttpServer())
          .post(
            `/componentes-pontuacao/${componentes.get(nomeComponente)}/lancamentos`,
          )
          .set('Authorization', `Bearer ${tokens.principal}`)
          .send({ alunoId, valorNoModelo: valor })
          .expect(201);
      }
    }
  }, 90000);

  it('encerrar o bimestre 1 grava as três sínteses e sinaliza o empate', async () => {
    const bimestreId = idsBimestres[0];

    const resposta: Encerramento = await request(app.getHttpServer())
      .post(`/bimestres/${bimestreId}/encerrar`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(201);

    expect(resposta.body).toMatchObject({
      bimestreId,
      numero: 1,
      situacao: 'ENCERRADO',
      totais: { alunos: 4, materias: 2, grupos: 2 },
      gruposSemIntegrantes: [],
      competicaoConcluida: false,
      pontuacoesFinais: null,
    });
    expect(typeof resposta.body.encerradoEm).toBe('string');

    // Síntese por matéria: 4 alunos x 2 matérias.
    expect(resposta.body.sinteseAlunoComponente).toHaveLength(8);
    for (const nota of NOTAS) {
      const alunoId = idsAlunosSala[nota.indice];
      const daMat = resposta.body.sinteseAlunoComponente.find(
        (s) => s.alunoId === alunoId && s.componenteCurricularId === materiaMat,
      );
      const daPor = resposta.body.sinteseAlunoComponente.find(
        (s) => s.alunoId === alunoId && s.componenteCurricularId === materiaPor,
      );
      expect(daMat).toMatchObject({ materiaNome: 'Matemática', valor: nota.sinteseMateria });
      expect(daPor).toMatchObject({ materiaNome: 'Português', valor: nota.sintesePortugues });
    }

    // Síntese bimestral do aluno.
    expect(resposta.body.sinteseAluno).toHaveLength(4);
    for (const nota of NOTAS) {
      expect(
        resposta.body.sinteseAluno.find(
          (s) => s.alunoId === idsAlunosSala[nota.indice],
        ),
      ).toMatchObject({ valor: nota.sinteseBimestral });
    }

    // Síntese do grupo (ordenada do maior para o menor).
    expect(resposta.body.sinteseGrupo).toEqual([
      {
        bimestreId,
        grupoId: grupoAlfa,
        nome: 'Grupo Alfa',
        integrantes: 2,
        valor: SINTESE_GRUPO,
      },
      {
        bimestreId,
        grupoId: grupoBeta,
        nome: 'Grupo Beta',
        integrantes: 2,
        valor: SINTESE_GRUPO,
      },
    ]);

    // Empate sinalizado para o professor (RN23).
    expect(resposta.body.empates).toEqual([
      {
        bimestreId,
        valor: SINTESE_GRUPO,
        grupos: [
          { grupoId: grupoAlfa, nome: 'Grupo Alfa', valor: SINTESE_GRUPO },
          { grupoId: grupoBeta, nome: 'Grupo Beta', valor: SINTESE_GRUPO },
        ],
      },
    ]);
  });

  it('as três tabelas de síntese foram gravadas com os valores devolvidos', async () => {
    const bimestreId = idsBimestres[0];

    const [porComponente, porAluno, porGrupo] = await Promise.all([
      prisma.sinteseAlunoComponente.findMany({
        where: { bimestreId },
        select: {
          alunoId: true,
          componenteCurricularId: true,
          valor: true,
        },
      }),
      prisma.sinteseAluno.findMany({
        where: { bimestreId },
        select: { alunoId: true, valor: true },
      }),
      prisma.sinteseGrupo.findMany({
        where: { bimestreId },
        select: { grupoId: true, valor: true },
      }),
    ]);

    expect(porComponente).toHaveLength(8);
    expect(porAluno).toHaveLength(4);
    expect(porGrupo).toHaveLength(2);

    const porAlunoId = new Map(porAluno.map((s) => [s.alunoId, Number(s.valor)]));
    for (const nota of NOTAS) {
      const alunoId = idsAlunosSala[nota.indice];
      expect(porAlunoId.get(alunoId)).toBe(nota.sinteseBimestral);
      expect(
        Number(
          porComponente.find(
            (s) => s.alunoId === alunoId && s.componenteCurricularId === materiaMat,
          )?.valor,
        ),
      ).toBe(nota.sinteseMateria);
      expect(
        Number(
          porComponente.find(
            (s) => s.alunoId === alunoId && s.componenteCurricularId === materiaPor,
          )?.valor,
        ),
      ).toBe(nota.sintesePortugues);
    }

    for (const sintese of porGrupo) {
      expect(Number(sintese.valor)).toBe(SINTESE_GRUPO);
    }

    expect(
      (
        await prisma.bimestre.findUniqueOrThrow({
          where: { id: bimestreId },
          select: { situacao: true },
        })
      ).situacao,
    ).toBe('ENCERRADO');
  });

  it('bimestre encerrado congela lançamentos, pesos e grupos (409)', async () => {
    const bimestreId = idsBimestres[0];
    const componentes = componentesPorBimestre.get(bimestreId)!;

    await request(app.getHttpServer())
      .post(`/bimestres/${bimestreId}/componentes-pontuacao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        componenteCurricularId: materiaMat,
        nome: 'Prova Extra',
        pesoPercentual: 100,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/componentes-pontuacao/${componentes.prova}/lancamentos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ alunoId: idsAlunosSala[0], valorNoModelo: '1' })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/componentes-pontuacao/${componentes.prova}/lancamentos/lote`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        lancamentos: [{ alunoId: idsAlunosSala[0], valorNoModelo: '1' }],
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/grupos/${grupoAlfa}/membros`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ alunoId: idsAlunosSala[0], bimestreId })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/grupos/${grupoAlfa}/membros/${idsAlunosSala[1]}?bimestreId=${bimestreId}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(409);

    // E o próprio encerramento não pode se repetir.
    await request(app.getHttpServer())
      .post(`/bimestres/${bimestreId}/encerrar`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(409);
  });

  it('encerrar de bimestre de outro professor (403) e de bimestre inexistente (404)', async () => {
    const bimestreAberto = idsBimestres[1];

    await request(app.getHttpServer())
      .post(`/bimestres/${bimestreAberto}/encerrar`)
      .set('Authorization', `Bearer ${tokens.fora}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/bimestres/11111111-1111-4111-8111-111111111111/encerrar')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(404);
  });

  it('encerra os bimestres 2 e 3 sem calcular pontuação final', async () => {
    for (const bimestreId of idsBimestres.slice(1, 3)) {
      await prepararBimestre(bimestreId);

      const resposta: Encerramento = await request(app.getHttpServer())
        .post(`/bimestres/${bimestreId}/encerrar`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .expect(201);

      expect(resposta.body.competicaoConcluida).toBe(false);
      expect(resposta.body.pontuacoesFinais).toBeNull();
      expect(resposta.body.sinteseGrupo).toHaveLength(2);
      expect(resposta.body.sinteseGrupo.every((g) => g.valor === SINTESE_GRUPO)).toBe(
        true,
      );
    }
  }, 90000);

  it('encerrar o 4º bimestre devolve a pontuação final de alunos e grupos', async () => {
    const bimestreId = idsBimestres[3];
    await prepararBimestre(bimestreId);

    const resposta: Encerramento = await request(app.getHttpServer())
      .post(`/bimestres/${bimestreId}/encerrar`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(201);

    expect(resposta.body).toMatchObject({
      bimestreId,
      numero: 4,
      situacao: 'ENCERRADO',
      competicaoConcluida: true,
    });

    const finais = resposta.body.pontuacoesFinais!;
    expect(finais.alunos).toHaveLength(4);
    expect(finais.alunos).toEqual(
      [...NOTAS]
        .sort((a, b) => b.sinteseBimestral - a.sinteseBimestral)
        .map((nota) => ({
          alunoId: idsAlunosSala[nota.indice],
          nome: `Aluno ${['Ana', 'Bruno', 'Carla', 'Diego'][nota.indice]} (E2E)`,
          // Média simples das quatro sínteses bimestrais idênticas.
          valor: nota.sinteseBimestral,
        })),
    );

    expect(finais.grupos).toEqual([
      {
        grupoId: grupoAlfa,
        nome: 'Grupo Alfa',
        valor: PONTUACAO_FINAL_GRUPO,
      },
      {
        grupoId: grupoBeta,
        nome: 'Grupo Beta',
        valor: PONTUACAO_FINAL_GRUPO,
      },
    ]);

    const bimestresEncerrados = await prisma.bimestre.count({
      where: { competicaoId, situacao: 'ENCERRADO' },
    });
    expect(bimestresEncerrados).toBe(4);
  }, 90000);
});
