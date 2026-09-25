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

describe('Relatórios (e2e)', () => {
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
        nome: 'Escola Numerica Relatorios (E2E)',
        modeloAvaliacaoId: ID_MODELO_NUMERICO,
      },
    });
    idsEscolas.push(escolaNumerica.id);
    escolaNumericaId = escolaNumerica.id;

    const escolaFora = await prisma.escola.create({
      data: {
        nome: 'Escola Fora Relatorios (E2E)',
        modeloAvaliacaoId: ID_MODELO_NUMERICO,
      },
    });
    idsEscolas.push(escolaFora.id);

    tokens.principal = (await criarProfessorCredenciado(
      'Professor Relatorios (E2E)',
      escolaNumericaId,
    )).token;
    tokens.fora = (await criarProfessorCredenciado(
      'Professor Fora Relatorios (E2E)',
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

  interface AlunoDaSala {
    id: string;
    codigo: string;
    nome: string;
  }
  const alunos: Record<string, AlunoDaSala> = {};
  const nomesPorAluno: Record<string, string> = {};

  async function prepararBimestre(
    bimestreId: string,
    notas: Record<string, { mat: number; por: number }>,
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

    for (const [chave, notasDoAluno] of Object.entries(notas)) {
      const alunoId = alunos[chave].id;
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

  async function criarAlunoSala(nomeAluno: string): Promise<AlunoDaSala> {
    const resposta = await request(app.getHttpServer())
      .post(`/salas/${salaId}/alunos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ nome: `Aluno ${nomeAluno} (E2E)` })
      .expect(201);
    return {
      id: resposta.body.id as string,
      codigo: resposta.body.codigoMatricula as string,
      nome: resposta.body.nome as string,
    };
  }

  it('fluxo: sala, competição, grupos, membros e alunos autenticáveis', async () => {
    const sala = await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ nome: '3º D (Relatórios)', anoLetivo: ANO, escolaId: escolaNumericaId })
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

    for (const nome of ['Ana', 'Bia', 'Cris', 'Dani', 'Zeca']) {
      const aluno = await criarAlunoSala(nome);
      alunos[nome] = aluno;
      nomesPorAluno[aluno.id] = aluno.nome;
      idsAlunos.push(aluno.codigo);
    }

    const competicao = await request(app.getHttpServer())
      .post('/competicoes')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        nome: 'Torneio Relatórios',
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

    // Zeca fica fora dos grupos de propósito (para o teste de 403).
    const membros: Record<string, string[]> = { [grupoAlfa]: ['Ana', 'Bia'], [grupoBeta]: ['Cris', 'Dani'] };
    for (const bimestreId of idsBimestres) {
      for (const [grupoId, nomes] of Object.entries(membros)) {
        for (const nome of nomes) {
          await request(app.getHttpServer())
            .post(`/grupos/${grupoId}/membros`)
            .set('Authorization', `Bearer ${tokens.principal}`)
            .send({ alunoId: alunos[nome].id, bimestreId })
            .expect(201);
        }
      }
    }
  }, 90000);

  it('encerra o bimestre 1', async () => {
    await prepararBimestre(idsBimestres[0], {
      Ana: { mat: 8, por: 8 }, // 8.0
      Bia: { mat: 6, por: 8 }, // 7.0
      Cris: { mat: 8, por: 8 }, // 8.0
      Dani: { mat: 6, por: 6 }, // 6.0
    });
    await encerrar(idsBimestres[0]);
    // Alfa = média(8,7) = 7.5 | Beta = média(8,6) = 7.0
  }, 90000);

  it('encerra o bimestre 2', async () => {
    await prepararBimestre(idsBimestres[1], {
      Ana: { mat: 10, por: 8 }, // 9.0
      Bia: { mat: 8, por: 8 }, // 8.0
      Cris: { mat: 8, por: 8 }, // 8.0
      Dani: { mat: 6, por: 8 }, // 7.0
    });
    await encerrar(idsBimestres[1]);
    // Alfa = 8.5 | Beta = 7.5
  }, 90000);

  it('encerra o bimestre 3', async () => {
    await prepararBimestre(idsBimestres[2], {
      Ana: { mat: 8, por: 8 }, // 8.0
      Bia: { mat: 6, por: 6 }, // 6.0
      Cris: { mat: 8, por: 8 }, // 8.0
      Dani: { mat: 6, por: 6 }, // 6.0
    });
    await encerrar(idsBimestres[2]);
    // Alfa = 7.0 | Beta = 7.0
  }, 90000);

  it('encerra o bimestre 4', async () => {
    await prepararBimestre(idsBimestres[3], {
      Ana: { mat: 8, por: 8 }, // 8.0
      Bia: { mat: 8, por: 6 }, // 7.0
      Cris: { mat: 6, por: 8 }, // 7.0
      Dani: { mat: 6, por: 6 }, // 6.0
    });
    await encerrar(idsBimestres[3]);
    // Alfa = 7.5 | Beta = 6.5
  }, 90000);

  it('aluno fora do grupo recebe 403 nos relatórios coletivos de outro grupo', async () => {
    const tokenZeca = await login(alunos.Zeca.codigo, alunos.Zeca.codigo);

    await request(app.getHttpServer())
      .get(`/grupos/${grupoAlfa}/relatorio`)
      .set('Authorization', `Bearer ${tokenZeca}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/grupos/${grupoAlfa}/relatorio-comparativo`)
      .set('Authorization', `Bearer ${tokenZeca}`)
      .expect(403);
  });

  it('professor de outra competição recebe 403 nos relatórios', async () => {
    await request(app.getHttpServer())
      .get(`/grupos/${grupoAlfa}/relatorio`)
      .set('Authorization', `Bearer ${tokens.fora}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/alunos/${alunos.Ana.id}/relatorio-individual?competicaoId=${competicaoId}`)
      .set('Authorization', `Bearer ${tokens.fora}`)
      .expect(403);
  });

  it('aluno acessa o próprio relatório individual e comparativo com o grupo', async () => {
    const tokenAna = await login(alunos.Ana.codigo, alunos.Ana.codigo);

    const individual = await request(app.getHttpServer())
      .get(`/alunos/${alunos.Ana.id}/relatorio-individual`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .expect(200);

    expect(individual.body).toMatchObject({
      tipo: 'individual',
      alunoId: alunos.Ana.id,
      competicaoId,
      competicaoNome: 'Torneio Relatórios',
      // Ana: (8 + 9 + 8 + 8) / 4
      pontuacaoFinal: 8.25,
    });
    expect(individual.body.bimestres).toHaveLength(4);
    expect(individual.body.bimestres[0]).toMatchObject({
      numero: 1,
      valor: 8,
    });
    expect(
      individual.body.bimestres[0].materias.map((m: { nome: string; valor: number }) => ({
        nome: m.nome,
        valor: m.valor,
      })),
    ).toEqual([
      { nome: 'Matemática', valor: 8 },
      { nome: 'Português', valor: 8 },
    ]);

    const comparativo = await request(app.getHttpServer())
      .get(`/alunos/${alunos.Ana.id}/relatorio-comparativo-grupo`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .expect(200);

    expect(comparativo.body.tipo).toBe('comparativo-grupo');
    expect(comparativo.body.bimestres[0].grupo).toEqual({
      grupoId: grupoAlfa,
      nome: 'Grupo Alfa',
    });
    // Colegas de grupo no bimestre 1: Bia, com a mesma síntese bimestral.
    expect(comparativo.body.bimestres[0].colegasDeGrupo).toHaveLength(1);
    expect(comparativo.body.bimestres[0].colegasDeGrupo[0]).toMatchObject({
      alunoId: alunos.Bia.id,
      nome: nomesPorAluno[alunos.Bia.id],
      valor: 7,
    });
    expect(
      comparativo.body.bimestres[0].colegasDeGrupo[0].materias.map(
        (m: { nome: string; valor: number }) => ({ nome: m.nome, valor: m.valor }),
      ),
    ).toEqual([
      { nome: 'Matemática', valor: 6 },
      { nome: 'Português', valor: 8 },
    ]);
  });

  it('aluno matriculado sem grupo tem relatório individual; aluno de grupo de outra pessoa vê apenas o próprio', async () => {
    const tokenZeca = await login(alunos.Zeca.codigo, alunos.Zeca.codigo);

    const zeca = await request(app.getHttpServer())
      .get(`/alunos/${alunos.Zeca.id}/relatorio-individual?competicaoId=${competicaoId}`)
      .set('Authorization', `Bearer ${tokenZeca}`)
      .expect(200);

    // Sem lançamentos, a síntese do matriculado é 0 (RN19).
    expect(zeca.body).toMatchObject({
      tipo: 'individual',
      alunoId: alunos.Zeca.id,
      pontuacaoFinal: 0,
    });
    expect(zeca.body.bimestres).toHaveLength(4);
    expect(zeca.body.bimestres.every((b: { valor: number }) => b.valor === 0)).toBe(true);

    // Ana não pode ler o relatório de Zeca (só o próprio).
    const tokenAna = await login(alunos.Ana.codigo, alunos.Ana.codigo);
    await request(app.getHttpServer())
      .get(`/alunos/${alunos.Zeca.id}/relatorio-individual?competicaoId=${competicaoId}`)
      .set('Authorization', `Bearer ${tokenAna}`)
      .expect(403);
  });

  it('professor acessa o relatório coletivo e o comparativo do grupo', async () => {
    const coletivo = await request(app.getHttpServer())
      .get(`/grupos/${grupoAlfa}/relatorio`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(coletivo.body).toMatchObject({
      tipo: 'coletivo-grupo',
      grupoId: grupoAlfa,
      nome: 'Grupo Alfa',
      competicaoId,
      competicaoNome: 'Torneio Relatórios',
      // 7.5 + 8.5 + 7.0 + 7.5 = 30.5, separada dos bimestres (0-10).
      pontuacaoFinal: 30.5,
    });
    expect(coletivo.body.bimestres).toHaveLength(4);
    expect(coletivo.body.bimestres[0]).toMatchObject({
      numero: 1,
      valor: 7.5,
    });
    expect(
      coletivo.body.bimestres[0].integrantes.map((i: { nome: string; valor: number }) => ({
        nome: i.nome,
        valor: i.valor,
      })),
    ).toEqual([
      { nome: nomesPorAluno[alunos.Ana.id], valor: 8 },
      { nome: nomesPorAluno[alunos.Bia.id], valor: 7 },
    ]);

    const comparativo = await request(app.getHttpServer())
      .get(`/grupos/${grupoAlfa}/relatorio-comparativo`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(comparativo.body.tipo).toBe('comparativo-grupos');
    expect(comparativo.body.comparativo).toHaveLength(1);
    expect(comparativo.body.comparativo[0]).toMatchObject({
      grupoId: grupoBeta,
      nome: 'Grupo Beta',
    });
  });

  it('comparativo anual separa os bimestres (0-10) da pontuação final do grupo (até 40)', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/grupos/${grupoAlfa}/relatorio-comparativo`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    const beta = resposta.body.comparativo.find(
      (g: { grupoId: string }) => g.grupoId === grupoBeta,
    );

    // Por bimestre, a escala é 0-10.
    expect(beta.bimestres.map((b: { valor: number }) => b.valor)).toEqual([
      7.0, 7.5, 7.0, 6.5,
    ]);
    // A pontuação final é a SOMA (0-40), em campo próprio e separado dos
    // valores bimestrais — nunca misturada num único número com eles.
    expect(beta.pontuacaoFinal).toBe(28);
    expect(resposta.body.pontuacaoFinal).toBe(30.5);
  });
});