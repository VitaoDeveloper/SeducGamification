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

function dataIso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function ms(dataIsoString: string): number {
  return new Date(dataIsoString).getTime();
}

describe('Competicoes e Grupos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const idsAlunos: string[] = [];
  const idsSalas: string[] = [];
  const idsEscolas: string[] = [];
  const idsProfessores: string[] = [];
  const idsLecionamentos: string[] = [];
  const idsCompeticoes: string[] = [];

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
        nome: 'Escola Fora Competicao (E2E)',
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
    tokens.mesmaEscola = (await criarProfessorCredenciado(
      'Professor Mesma Escola Comp (E2E)',
      escolaExemplo.id,
    )).token;
    tokens.fora = (await criarProfessorCredenciado(
      'Professor Fora Comp (E2E)',
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
    await prisma.sala.deleteMany({
      where: { id: { in: idsSalas } },
    });
    await prisma.aluno.deleteMany({
      where: { codigoMatricula: { in: idsAlunos } },
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

  const tokens = { principal: '', mesmaEscola: '', fora: '' };
  let escolaExemploId: string;
  let salaId: string;
  let lecionamentoId: string;
  let competicaoId: string;
  let idBimestre1 = '';
  let idBimestre2 = '';
  let idBimestre4 = '';
  const idsGrupos: string[] = [];
  const idsAlunosSala: string[] = [];

  it('fluxo: cria sala, inscrição e 6 alunos na sala', async () => {
    escolaExemploId = (
      await prisma.escola.findFirstOrThrow({
        where: { nome: 'Escola Estadual de Exemplo' },
      })
    ).id;

    const sala = await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ nome: '2º DS (Comp)', anoLetivo: ANO, escolaId: escolaExemploId })
      .expect(201);
    salaId = sala.body.id;
    idsSalas.push(salaId);

    const inscricao = await request(app.getHttpServer())
      .post(`/salas/${salaId}/inscricao`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ componentes: ['Interfaces Web'] })
      .expect(201);
    lecionamentoId = inscricao.body.id;
    idsLecionamentos.push(lecionamentoId);

    for (let i = 1; i <= 6; i++) {
      const aluno = await request(app.getHttpServer())
        .post(`/salas/${salaId}/alunos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ nome: `Competidor ${i} (E2E)` })
        .expect(201);
      idsAlunos.push(aluno.body.codigoMatricula);
      idsAlunosSala.push(aluno.body.id);
    }
  });

  it('cria competição com exatamente 4 bimestres e datas corretas', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/competicoes')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        nome: 'Torneio 2026',
        lecionamentoId,
        bimestres: [
          { numero: 1, dataInicio: dataIso(ANO, 2, 2), dataFim: dataIso(ANO, 4, 24) },
          { numero: 2, dataInicio: dataIso(ANO, 4, 27), dataFim: dataIso(ANO, 7, 3) },
          { numero: 3, dataInicio: dataIso(ANO, 8, 3), dataFim: dataIso(ANO, 10, 2) },
          { numero: 4, dataInicio: dataIso(ANO, 10, 5), dataFim: dataIso(ANO, 12, 18) },
        ],
      })
      .expect(201);

    expect(resposta.body).toMatchObject({
      nome: 'Torneio 2026',
      lecionamentoId,
    });
    expect(resposta.body.bimestres).toHaveLength(4);
    expect(resposta.body.bimestres.map((b: { numero: number }) => b.numero)).toEqual([1, 2, 3, 4]);
    expect(ms(resposta.body.bimestres[0].dataInicio)).toBe(ms(dataIso(ANO, 2, 2)));
    expect(ms(resposta.body.bimestres[3].dataFim)).toBe(ms(dataIso(ANO, 12, 18)));

    competicaoId = resposta.body.id;
    idsCompeticoes.push(competicaoId);
    idBimestre1 = resposta.body.bimestres.find(
      (b: { numero: number }) => b.numero === 1,
    ).id;
    idBimestre2 = resposta.body.bimestres.find(
      (b: { numero: number }) => b.numero === 2,
    ).id;
    idBimestre4 = resposta.body.bimestres.find(
      (b: { numero: number }) => b.numero === 4,
    ).id;
  });

  it('rejeita bimestres sobrepostos (400)', async () => {
    await request(app.getHttpServer())
      .post('/competicoes')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        nome: 'Competicao Invalida',
        lecionamentoId,
        bimestres: [
          { numero: 1, dataInicio: dataIso(ANO, 2, 2), dataFim: dataIso(ANO, 4, 24) },
          { numero: 2, dataInicio: dataIso(ANO, 4, 20), dataFim: dataIso(ANO, 7, 3) },
          { numero: 3, dataInicio: dataIso(ANO, 8, 3), dataFim: dataIso(ANO, 10, 2) },
          { numero: 4, dataInicio: dataIso(ANO, 10, 5), dataFim: dataIso(ANO, 12, 18) },
        ],
      })
      .expect(400);
  });

  it('rejeita competição com número de bimestre duplicado (400)', async () => {
    await request(app.getHttpServer())
      .post('/competicoes')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        nome: 'Competicao Invalida 2',
        lecionamentoId,
        bimestres: [
          { numero: 1, dataInicio: dataIso(ANO, 2, 2), dataFim: dataIso(ANO, 4, 24) },
          { numero: 1, dataInicio: dataIso(ANO, 4, 27), dataFim: dataIso(ANO, 7, 3) },
          { numero: 3, dataInicio: dataIso(ANO, 8, 3), dataFim: dataIso(ANO, 10, 2) },
          { numero: 4, dataInicio: dataIso(ANO, 10, 5), dataFim: dataIso(ANO, 12, 18) },
        ],
      })
      .expect(400);
  });

  it('detalhe da competição traz bimestres e grupos', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body.id).toBe(competicaoId);
    expect(resposta.body.bimestres).toHaveLength(4);
    expect(resposta.body.gruposCompetidores).toEqual([]);
  });

  it('lista competições do lecionamento (permite mais de uma)', async () => {
    const segunda = await request(app.getHttpServer())
      .post('/competicoes')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({
        nome: 'Torneio 2026 B',
        lecionamentoId,
        bimestres: [
          { numero: 1, dataInicio: dataIso(ANO, 2, 2), dataFim: dataIso(ANO, 4, 24) },
          { numero: 2, dataInicio: dataIso(ANO, 4, 27), dataFim: dataIso(ANO, 7, 3) },
          { numero: 3, dataInicio: dataIso(ANO, 8, 3), dataFim: dataIso(ANO, 10, 2) },
          { numero: 4, dataInicio: dataIso(ANO, 10, 5), dataFim: dataIso(ANO, 12, 18) },
        ],
      })
      .expect(201);
    idsCompeticoes.push(segunda.body.id);

    const lista = await request(app.getHttpServer())
      .get(`/lecionamentos/${lecionamentoId}/competicoes`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(lista.body).toHaveLength(2);
    expect(lista.body.some((c: { id: string }) => c.id === competicaoId)).toBe(true);
  });

  it('professor de outra escola não cria competição em lecionamento de outro (403)', async () => {
    await request(app.getHttpServer())
      .post('/competicoes')
      .set('Authorization', `Bearer ${tokens.fora}`)
      .send({
        nome: 'Competicao Alheia',
        lecionamentoId,
        bimestres: [
          { numero: 1, dataInicio: dataIso(ANO, 2, 2), dataFim: dataIso(ANO, 4, 24) },
          { numero: 2, dataInicio: dataIso(ANO, 4, 27), dataFim: dataIso(ANO, 7, 3) },
          { numero: 3, dataInicio: dataIso(ANO, 8, 3), dataFim: dataIso(ANO, 10, 2) },
          { numero: 4, dataInicio: dataIso(ANO, 10, 5), dataFim: dataIso(ANO, 12, 18) },
        ],
      })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}`)
      .set('Authorization', `Bearer ${tokens.mesmaEscola}`)
      .expect(403);
  });

  it('cria 2 grupos da competição', async () => {
    for (const nome of ['Grupo Alfa', 'Grupo Beta']) {
      const resposta = await request(app.getHttpServer())
        .post(`/competicoes/${competicaoId}/grupos`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ nome })
        .expect(201);
      expect(resposta.body).toMatchObject({ competicaoId, nome });
      idsGrupos.push(resposta.body.id);
    }

    const detalhe = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);
    expect(detalhe.body.gruposCompetidores).toHaveLength(2);
  });

  it('distribui 6 alunos nos 2 grupos no bimestre 1', async () => {
    const grupoA = idsGrupos[0];
    const grupoB = idsGrupos[1];
    for (let i = 0; i < 6; i++) {
      const grupo = i < 3 ? grupoA : grupoB;
      await request(app.getHttpServer())
        .post(`/grupos/${grupo}/membros`)
        .set('Authorization', `Bearer ${tokens.principal}`)
        .send({ alunoId: idsAlunosSala[i], bimestreId: idBimestre1 })
        .expect(201);
    }
  });

  it('aluno de outra sala não entra no grupo (400)', async () => {
    const outraSala = await request(app.getHttpServer())
      .post('/salas')
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ nome: 'Sala Paralela (Comp)', anoLetivo: ANO, escolaId: escolaExemploId })
      .expect(201);
    idsSalas.push(outraSala.body.id);

    const alunoFora = await request(app.getHttpServer())
      .post(`/salas/${outraSala.body.id}/alunos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ nome: 'Aluno de Outra Sala (Comp)' })
      .expect(201);
    idsAlunos.push(alunoFora.body.codigoMatricula);

    await request(app.getHttpServer())
      .post(`/grupos/${idsGrupos[0]}/membros`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ alunoId: alunoFora.body.id, bimestreId: idBimestre1 })
      .expect(400);
  });

  it('mesmo aluno em dois grupos no mesmo bimestre retorna 409', async () => {
    await request(app.getHttpServer())
      .post(`/grupos/${idsGrupos[1]}/membros`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ alunoId: idsAlunosSala[0], bimestreId: idBimestre1 })
      .expect(409);
  });

  it('listar grupos com membros no bimestre informado', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/grupos?bimestreId=${idBimestre1}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body.bimestreId).toBe(idBimestre1);
    expect(resposta.body.grupos).toHaveLength(2);
    const alfa = resposta.body.grupos.find(
      (g: { id: string }) => g.id === idsGrupos[0],
    );
    const beta = resposta.body.grupos.find(
      (g: { id: string }) => g.id === idsGrupos[1],
    );
    expect(alfa.membrosGrupos).toHaveLength(3);
    expect(beta.membrosGrupos).toHaveLength(3);
  });

  it('listar grupos sem bimestre resolve o bimestre aberto mais recente', async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/grupos`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    expect(resposta.body.bimestreId).toBe(idBimestre4);
    expect(resposta.body.grupos[0].membrosGrupos).toEqual([]);
  });

  it('mover aluno de grupo no bimestre aberto: sai do antigo e entra no novo', async () => {
    const grupoA = idsGrupos[0];
    const grupoB = idsGrupos[1];
    const aluno = idsAlunosSala[0];

    await request(app.getHttpServer())
      .delete(`/grupos/${grupoA}/membros/${aluno}?bimestreId=${idBimestre1}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(204);

    await request(app.getHttpServer())
      .post(`/grupos/${grupoB}/membros`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ alunoId: aluno, bimestreId: idBimestre1 })
      .expect(201);

    const lista = await request(app.getHttpServer())
      .get(`/competicoes/${competicaoId}/grupos?bimestreId=${idBimestre1}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(200);

    const nomesA = lista.body.grupos
      .find((g: { id: string }) => g.id === grupoA)
      .membrosGrupos.map((m: { aluno: { id: string } }) => m.aluno.id);
    const nomesB = lista.body.grupos
      .find((g: { id: string }) => g.id === grupoB)
      .membrosGrupos.map((m: { aluno: { id: string } }) => m.aluno.id);

    expect(nomesA).not.toContain(aluno);
    expect(nomesB).toContain(aluno);
  });

  it('não altera membros de bimestre encerrado (409)', async () => {
    await prisma.bimestre.update({
      where: { id: idBimestre2 },
      data: { situacao: 'ENCERRADO' },
    });

    await request(app.getHttpServer())
      .post(`/grupos/${idsGrupos[0]}/membros`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .send({ alunoId: idsAlunosSala[3], bimestreId: idBimestre2 })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/grupos/${idsGrupos[0]}/membros/${idsAlunosSala[1]}?bimestreId=${idBimestre2}`)
      .set('Authorization', `Bearer ${tokens.principal}`)
      .expect(409);

    await prisma.bimestre.update({
      where: { id: idBimestre2 },
      data: { situacao: 'ABERTO' },
    });
  });
});
