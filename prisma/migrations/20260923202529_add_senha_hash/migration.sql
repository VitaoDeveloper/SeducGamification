/*
  Warnings:

  - Added the required column `senha_hash` to the `alunos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `senha_hash` to the `professores` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "alunos" ADD COLUMN     "senha_hash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "professores" ADD COLUMN     "senha_hash" TEXT NOT NULL;
