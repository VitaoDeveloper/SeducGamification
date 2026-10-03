import { Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { exigirProfessor } from '../shared/acesso-escolar.util.js';
import {
  ESCOLA_COM_MODELO_DE_AVALIACAO,
  comModeloDeAvaliacao,
} from '../shared/escola-com-modelo.util.js';

/**
 * Escolas às quais o professor da sessão está vinculado.
 *
 * A consulta sai da tabela de vínculos, e não de `salas`, porque é o vínculo que
 * define o alcance do professor — a mesma fonte que `POST /salas` consulta em
 * `exigirVinculoProfessorEscola` e que `GET /salas` usa para filtrar as salas.
 * Deduzir as escolas a partir das salas traria de volta o problema que esta rota
 * resolve: uma escola sem nenhuma sala não apareceria para o professor que
 * precisa criar a primeira.
 *
 * O `vinculoProfessor` tem chave primária composta `(professorId, escolaId)`,
 * então a lista já vem sem repetição. A ordem por nome é da interface, não do
 * banco: é a ordem em que o professor reconhece as instituições, e nenhuma
 * outra propriedade distingue uma da outra.
 */
@Injectable()
export class EscolasService {
  constructor(private readonly prisma: PrismaService) {}

  async listarDoProfessor(user: UsuarioAutenticado | undefined) {
    const professor = exigirProfessor(user);
    const vinculos = await this.prisma.vinculoProfessor.findMany({
      where: { professorId: professor.id },
      select: { escola: { select: ESCOLA_COM_MODELO_DE_AVALIACAO } },
      orderBy: { escola: { nome: 'asc' } },
    });
    return vinculos.map((vinculo) => comModeloDeAvaliacao(vinculo.escola));
  }
}
