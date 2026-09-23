-- CreateEnum
CREATE TYPE "TipoEscala" AS ENUM ('NUMERICA', 'CPS_ETEC');

-- CreateEnum
CREATE TYPE "SituacaoBimestre" AS ENUM ('ABERTO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "OrigemDesempate" AS ENUM ('MANUAL', 'AUTOMATICO');

-- CreateTable
CREATE TABLE "modelos_avaliacao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo_escala" "TipoEscala" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelos_avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "niveis_escala" (
    "id" TEXT NOT NULL,
    "modelo_avaliacao_id" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "valor_numerico" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "niveis_escala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escolas" (
    "id" TEXT NOT NULL,
    "modelo_avaliacao_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escolas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo_matricula" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vinculos_professores" (
    "professor_id" TEXT NOT NULL,
    "escola_id" TEXT NOT NULL,

    CONSTRAINT "vinculos_professores_pkey" PRIMARY KEY ("professor_id","escola_id")
);

-- CreateTable
CREATE TABLE "salas" (
    "id" TEXT NOT NULL,
    "escola_id" TEXT NOT NULL,
    "professor_criador_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ano_letivo" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alunos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo_matricula" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alunos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matriculas" (
    "aluno_id" TEXT NOT NULL,
    "sala_id" TEXT NOT NULL,

    CONSTRAINT "matriculas_pkey" PRIMARY KEY ("aluno_id","sala_id")
);

-- CreateTable
CREATE TABLE "lecionamentos" (
    "id" TEXT NOT NULL,
    "professor_id" TEXT NOT NULL,
    "sala_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lecionamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "componentes_curriculares" (
    "id" TEXT NOT NULL,
    "lecionamento_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "componentes_curriculares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competicoes" (
    "id" TEXT NOT NULL,
    "lecionamento_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competicoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bimestres" (
    "id" TEXT NOT NULL,
    "competicao_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3) NOT NULL,
    "situacao" "SituacaoBimestre" NOT NULL DEFAULT 'ABERTO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bimestres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos_competidores" (
    "id" TEXT NOT NULL,
    "competicao_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grupos_competidores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membros_grupos" (
    "grupo_id" TEXT NOT NULL,
    "aluno_id" TEXT NOT NULL,
    "bimestre_id" TEXT NOT NULL,

    CONSTRAINT "membros_grupos_pkey" PRIMARY KEY ("grupo_id","aluno_id","bimestre_id")
);

-- CreateTable
CREATE TABLE "componentes_pontuacao" (
    "id" TEXT NOT NULL,
    "bimestre_id" TEXT NOT NULL,
    "componente_curricular_id" TEXT,
    "nome" TEXT NOT NULL,
    "peso_percentual" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "componentes_pontuacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos" (
    "componente_pontuacao_id" TEXT NOT NULL,
    "aluno_id" TEXT NOT NULL,
    "valor_no_modelo" TEXT NOT NULL,

    CONSTRAINT "lancamentos_pkey" PRIMARY KEY ("componente_pontuacao_id","aluno_id")
);

-- CreateTable
CREATE TABLE "sinteses_aluno_componente" (
    "bimestre_id" TEXT NOT NULL,
    "componente_curricular_id" TEXT NOT NULL,
    "aluno_id" TEXT NOT NULL,
    "valor" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "sinteses_aluno_componente_pkey" PRIMARY KEY ("bimestre_id","componente_curricular_id","aluno_id")
);

-- CreateTable
CREATE TABLE "sinteses_aluno" (
    "bimestre_id" TEXT NOT NULL,
    "aluno_id" TEXT NOT NULL,
    "valor" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "sinteses_aluno_pkey" PRIMARY KEY ("bimestre_id","aluno_id")
);

-- CreateTable
CREATE TABLE "sinteses_grupo" (
    "bimestre_id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "valor" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "sinteses_grupo_pkey" PRIMARY KEY ("bimestre_id","grupo_id")
);

-- CreateTable
CREATE TABLE "desempates" (
    "id" TEXT NOT NULL,
    "competicao_id" TEXT NOT NULL,
    "bimestre_id" TEXT,
    "grupo_id" TEXT NOT NULL,
    "posicao" INTEGER NOT NULL,
    "origem" "OrigemDesempate" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "desempates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predefinicoes_avaliacao" (
    "id" TEXT NOT NULL,
    "professor_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "predefinicoes_avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predefinicoes_componentes" (
    "id" TEXT NOT NULL,
    "predefinicao_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "peso_percentual" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "predefinicoes_componentes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "professores_codigo_matricula_key" ON "professores"("codigo_matricula");

-- CreateIndex
CREATE UNIQUE INDEX "alunos_codigo_matricula_key" ON "alunos"("codigo_matricula");

-- AddForeignKey
ALTER TABLE "niveis_escala" ADD CONSTRAINT "niveis_escala_modelo_avaliacao_id_fkey" FOREIGN KEY ("modelo_avaliacao_id") REFERENCES "modelos_avaliacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escolas" ADD CONSTRAINT "escolas_modelo_avaliacao_id_fkey" FOREIGN KEY ("modelo_avaliacao_id") REFERENCES "modelos_avaliacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_professores" ADD CONSTRAINT "vinculos_professores_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_professores" ADD CONSTRAINT "vinculos_professores_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "escolas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salas" ADD CONSTRAINT "salas_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "escolas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salas" ADD CONSTRAINT "salas_professor_criador_id_fkey" FOREIGN KEY ("professor_criador_id") REFERENCES "professores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_sala_id_fkey" FOREIGN KEY ("sala_id") REFERENCES "salas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecionamentos" ADD CONSTRAINT "lecionamentos_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecionamentos" ADD CONSTRAINT "lecionamentos_sala_id_fkey" FOREIGN KEY ("sala_id") REFERENCES "salas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componentes_curriculares" ADD CONSTRAINT "componentes_curriculares_lecionamento_id_fkey" FOREIGN KEY ("lecionamento_id") REFERENCES "lecionamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competicoes" ADD CONSTRAINT "competicoes_lecionamento_id_fkey" FOREIGN KEY ("lecionamento_id") REFERENCES "lecionamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bimestres" ADD CONSTRAINT "bimestres_competicao_id_fkey" FOREIGN KEY ("competicao_id") REFERENCES "competicoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos_competidores" ADD CONSTRAINT "grupos_competidores_competicao_id_fkey" FOREIGN KEY ("competicao_id") REFERENCES "competicoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_grupos" ADD CONSTRAINT "membros_grupos_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos_competidores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_grupos" ADD CONSTRAINT "membros_grupos_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_grupos" ADD CONSTRAINT "membros_grupos_bimestre_id_fkey" FOREIGN KEY ("bimestre_id") REFERENCES "bimestres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componentes_pontuacao" ADD CONSTRAINT "componentes_pontuacao_bimestre_id_fkey" FOREIGN KEY ("bimestre_id") REFERENCES "bimestres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componentes_pontuacao" ADD CONSTRAINT "componentes_pontuacao_componente_curricular_id_fkey" FOREIGN KEY ("componente_curricular_id") REFERENCES "componentes_curriculares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_componente_pontuacao_id_fkey" FOREIGN KEY ("componente_pontuacao_id") REFERENCES "componentes_pontuacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sinteses_aluno_componente" ADD CONSTRAINT "sinteses_aluno_componente_bimestre_id_fkey" FOREIGN KEY ("bimestre_id") REFERENCES "bimestres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sinteses_aluno_componente" ADD CONSTRAINT "sinteses_aluno_componente_componente_curricular_id_fkey" FOREIGN KEY ("componente_curricular_id") REFERENCES "componentes_curriculares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sinteses_aluno_componente" ADD CONSTRAINT "sinteses_aluno_componente_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sinteses_aluno" ADD CONSTRAINT "sinteses_aluno_bimestre_id_fkey" FOREIGN KEY ("bimestre_id") REFERENCES "bimestres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sinteses_aluno" ADD CONSTRAINT "sinteses_aluno_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sinteses_grupo" ADD CONSTRAINT "sinteses_grupo_bimestre_id_fkey" FOREIGN KEY ("bimestre_id") REFERENCES "bimestres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sinteses_grupo" ADD CONSTRAINT "sinteses_grupo_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos_competidores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desempates" ADD CONSTRAINT "desempates_competicao_id_fkey" FOREIGN KEY ("competicao_id") REFERENCES "competicoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desempates" ADD CONSTRAINT "desempates_bimestre_id_fkey" FOREIGN KEY ("bimestre_id") REFERENCES "bimestres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desempates" ADD CONSTRAINT "desempates_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos_competidores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predefinicoes_avaliacao" ADD CONSTRAINT "predefinicoes_avaliacao_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predefinicoes_componentes" ADD CONSTRAINT "predefinicoes_componentes_predefinicao_id_fkey" FOREIGN KEY ("predefinicao_id") REFERENCES "predefinicoes_avaliacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
