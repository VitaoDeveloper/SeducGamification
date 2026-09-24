import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ModeloAvaliacao } from '../../generated/prisma/client.js';
import {
  SituacaoBimestre,
  TipoEscala,
} from '../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { exigirProfessor } from '../shared/acesso-escolar.util.js';
import { LancarNotaDto } from './dto/lancar-nota.dto.js';
import { LancarNotasLoteDto } from './dto/lancar-notas-lote.dto.js';

interface ComponenteComContexto {
  id: string;
  bimestre: {
    situacao: SituacaoBimestre;
    competicao: {
      lecionamento: {
        professorId: string;
        sala: {
          id: string;
          escola: {
            modeloAvaliacao: ModeloAvaliacao & {
              nivelEscalas: { rotulo: string }[];
            };
          };
        };
      };
    };
  };
}

type BancoComMatricula = Pick<PrismaService, 'matricula'>;

const REGEX_NUMERICO = /^\d{1,2}(\.\d{1,2})?$/;

async function validarAlunoMatriculado(
  banco: BancoComMatricula,
  salaId: string,
  alunoId: string,
): Promise<void> {
  const registrada = await banco.matricula.findUnique({
    where: { alunoId_salaId: { alunoId, salaId } },
    select: { alunoId: true },
  });
  if (!registrada) {
    throw new BadRequestException(
      'Aluno não está matriculado na sala desta competição.',
    );
  }
}

function validarValorNoModelo(
  modelo: ModeloAvaliacao & { nivelEscalas: { rotulo: string }[] },
  valor: string,
): void {
  if (modelo.tipoEscala === TipoEscala.NUMERICA) {
    const numerico = Number(valor);
    if (!REGEX_NUMERICO.test(valor) || numerico < 1 || numerico > 10) {
      throw new BadRequestException(
        `Valor inválido para o modelo numérico (1 a 10): "${valor}".`,
      );
    }
    return;
  }

  const rotuloValido = modelo.nivelEscalas.some(
    (nivel) => nivel.rotulo === valor,
  );
  if (!rotuloValido) {
    throw new BadRequestException(
      `Rótulo inválido para o modelo conceitual: "${valor}".`,
    );
  }
}

@Injectable()
export class LancamentosService {
  constructor(private readonly prisma: PrismaService) {}

  async lancar(
    user: UsuarioAutenticado | undefined,
    componentePontuacaoId: string,
    dto: LancarNotaDto,
  ) {
    const professor = exigirProfessor(user);
    const componente = await this.carregarComponenteDoProfessor(
      professor.id,
      componentePontuacaoId,
    );
    this.exigirBimestreAberto(componente);

    const salaId =
      componente.bimestre.competicao.lecionamento.sala.id;
    await validarAlunoMatriculado(this.prisma, salaId, dto.alunoId);
    validarValorNoModelo(carregarModelo(componente), dto.valorNoModelo);

    return this.prisma.lancamento.upsert({
      where: {
        componentePontuacaoId_alunoId: {
          componentePontuacaoId,
          alunoId: dto.alunoId,
        },
      },
      create: {
        componentePontuacaoId,
        alunoId: dto.alunoId,
        valorNoModelo: dto.valorNoModelo,
      },
      update: { valorNoModelo: dto.valorNoModelo },
    });
  }

  async lancarLote(
    user: UsuarioAutenticado | undefined,
    componentePontuacaoId: string,
    dto: LancarNotasLoteDto,
  ) {
    const professor = exigirProfessor(user);
    const componente = await this.carregarComponenteDoProfessor(
      professor.id,
      componentePontuacaoId,
    );
    this.exigirBimestreAberto(componente);

    const salaId =
      componente.bimestre.competicao.lecionamento.sala.id;
    const modelo = carregarModelo(componente);

    const resultados = await this.prisma.$transaction(async (tx) => {
      const criados: unknown[] = [];
      for (const lance of dto.lancamentos) {
        await validarAlunoMatriculado(tx, salaId, lance.alunoId);
        validarValorNoModelo(modelo, lance.valorNoModelo);
        const registro = await tx.lancamento.upsert({
          where: {
            componentePontuacaoId_alunoId: {
              componentePontuacaoId,
              alunoId: lance.alunoId,
            },
          },
          create: {
            componentePontuacaoId,
            alunoId: lance.alunoId,
            valorNoModelo: lance.valorNoModelo,
          },
          update: { valorNoModelo: lance.valorNoModelo },
        });
        criados.push(registro);
      }
      return criados;
    });

    return resultados;
  }

  async listar(
    user: UsuarioAutenticado | undefined,
    componentePontuacaoId: string,
  ) {
    const professor = exigirProfessor(user);
    await this.carregarComponenteDoProfessor(
      professor.id,
      componentePontuacaoId,
    );

    return this.prisma.lancamento.findMany({
      where: { componentePontuacaoId },
      include: {
        aluno: { select: { id: true, nome: true, codigoMatricula: true } },
      },
      orderBy: { aluno: { nome: 'asc' } },
    });
  }

  private async carregarComponenteDoProfessor(
    professorId: string,
    componentePontuacaoId: string,
  ): Promise<ComponenteComContexto> {
    const componente = await this.prisma.componentePontuacao.findUnique({
      where: { id: componentePontuacaoId },
      include: {
        bimestre: {
          include: {
            competicao: {
              include: {
                lecionamento: {
                  include: {
                    sala: {
                      include: {
                        escola: {
                          include: {
                            modeloAvaliacao: { include: { nivelEscalas: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!componente) {
      throw new NotFoundException('Componente de pontuação não encontrado.');
    }
    if (
      componente.bimestre.competicao.lecionamento.professorId !== professorId
    ) {
      throw new ForbiddenException(
        'Componente pertence a uma competição de outro professor.',
      );
    }
    return componente;
  }

  private exigirBimestreAberto(
    componente: ComponenteComContexto,
  ): void {
    if (componente.bimestre.situacao !== SituacaoBimestre.ABERTO) {
      throw new ConflictException(
        'Não é possível lançar notas em um bimestre encerrado.',
      );
    }
  }
}

function carregarModelo(
  componente: ComponenteComContexto,
): ModeloAvaliacao & { nivelEscalas: { rotulo: string }[] } {
  return componente.bimestre.competicao.lecionamento.sala.escola
    .modeloAvaliacao;
}