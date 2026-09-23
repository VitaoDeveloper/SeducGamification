import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { TipoEscala } from '../src/generated/prisma/enums.js';
import { gerarCodigoMatricula } from '../src/modules/shared/codigo-matricula.util.js';

const ID_MODELO_NUMERICO = '00000000-0000-0000-0000-000000000001';
const ID_MODELO_ETEC = '00000000-0000-0000-0000-000000000002';
const ID_ESCOLA_EXEMPLO = '00000000-0000-0000-0000-000000000003';

const NOME_ESCOLA_EXEMPLO = 'Escola Estadual de Exemplo';
const NOME_PROFESSOR_EXEMPLO = 'Professor Exemplo';

const NIVEL_ETEC: ReadonlyArray<{
  id: string;
  rotulo: string;
  valorNumerico: number;
}> = [
  { id: '00000000-0000-0000-0000-000000000004', rotulo: 'I', valorNumerico: 3 },
  { id: '00000000-0000-0000-0000-000000000005', rotulo: 'R', valorNumerico: 5 },
  { id: '00000000-0000-0000-0000-000000000006', rotulo: 'B', valorNumerico: 8 },
  { id: '00000000-0000-0000-0000-000000000007', rotulo: 'MB', valorNumerico: 10 },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
  });

  try {
    const ano = new Date().getFullYear();
    let codigoMatriculaProfessor = '';

    await prisma.$transaction(async (tx) => {
      await tx.modeloAvaliacao.upsert({
        where: { id: ID_MODELO_NUMERICO },
        update: { nome: 'Numérico', tipoEscala: TipoEscala.NUMERICA },
        create: {
          id: ID_MODELO_NUMERICO,
          nome: 'Numérico',
          tipoEscala: TipoEscala.NUMERICA,
        },
      });

      await tx.modeloAvaliacao.upsert({
        where: { id: ID_MODELO_ETEC },
        update: { nome: 'CPS ETEC', tipoEscala: TipoEscala.CPS_ETEC },
        create: {
          id: ID_MODELO_ETEC,
          nome: 'CPS ETEC',
          tipoEscala: TipoEscala.CPS_ETEC,
        },
      });

      await tx.nivelEscala.deleteMany({
        where: { modeloAvaliacaoId: ID_MODELO_ETEC },
      });
      for (const nivel of NIVEL_ETEC) {
        await tx.nivelEscala.create({
          data: {
            id: nivel.id,
            modeloAvaliacaoId: ID_MODELO_ETEC,
            rotulo: nivel.rotulo,
            valorNumerico: nivel.valorNumerico,
          },
        });
      }

      const escola = await tx.escola.upsert({
        where: { id: ID_ESCOLA_EXEMPLO },
        update: { nome: NOME_ESCOLA_EXEMPLO, modeloAvaliacaoId: ID_MODELO_ETEC },
        create: {
          id: ID_ESCOLA_EXEMPLO,
          nome: NOME_ESCOLA_EXEMPLO,
          modeloAvaliacaoId: ID_MODELO_ETEC,
        },
      });

      const professorExistente = await tx.professor.findFirst({
        where: { nome: NOME_PROFESSOR_EXEMPLO },
      });

      let professor = professorExistente;
      if (!professor) {
        codigoMatriculaProfessor = await gerarCodigoMatricula(
          tx,
          ano,
          'professor',
        );
        const senhaHash = await hash(codigoMatriculaProfessor, 10);
        professor = await tx.professor.create({
          data: {
            nome: NOME_PROFESSOR_EXEMPLO,
            codigoMatricula: codigoMatriculaProfessor,
            senhaHash,
          },
        });
      } else {
        codigoMatriculaProfessor = professor.codigoMatricula;
      }

      await tx.vinculoProfessor.upsert({
        where: {
          professorId_escolaId: {
            professorId: professor.id,
            escolaId: escola.id,
          },
        },
        update: {},
        create: { professorId: professor.id, escolaId: escola.id },
      });
    });

    if (codigoMatriculaProfessor) {
      console.log(
        `Seed concluído. Professor de exemplo: "${NOME_PROFESSOR_EXEMPLO}" | matrícula: ${codigoMatriculaProfessor} | senha inicial: ${codigoMatriculaProfessor}`,
      );
    } else {
      console.log('Seed concluído sem criar professor de exemplo.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});