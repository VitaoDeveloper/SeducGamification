import { BadRequestException } from '@nestjs/common';

const TOTAL_BIMESTRES = 4;

export interface BimestreDatas {
  numero: number;
  dataInicio: Date;
  dataFim: Date;
}

export function validarDatasBimestresConjunto(
  bimestres: BimestreDatas[],
): void {
  const porNumero = new Map(bimestres.map((b) => [b.numero, b]));
  if (porNumero.size !== TOTAL_BIMESTRES) {
    throw new BadRequestException('Números de bimestre duplicados.');
  }
  for (let numero = 1; numero <= TOTAL_BIMESTRES; numero++) {
    if (!porNumero.has(numero)) {
      throw new BadRequestException(
        `Faltando definição do bimestre ${numero}.`,
      );
    }
  }

  const ordenados = [...bimestres].sort((a, b) => a.numero - b.numero);
  for (let i = 0; i < ordenados.length; i++) {
    const bimestre = ordenados[i];
    if (bimestre.dataFim.getTime() <= bimestre.dataInicio.getTime()) {
      throw new BadRequestException(
        `Bimestre ${bimestre.numero} tem data fim anterior ou igual à data início.`,
      );
    }
    if (
      i > 0 &&
      bimestre.dataInicio.getTime() <= ordenados[i - 1].dataFim.getTime()
    ) {
      throw new BadRequestException(
        'Bimestres com datas sobrepostas ou fora da ordem crescente.',
      );
    }
  }
}

export function validarDatasBimestreContraVizinhos(
  bimestre: BimestreDatas,
  vizinhos: ReadonlyArray<BimestreDatas>,
): void {
  const anterior = vizinhos.find((v) => v.numero === bimestre.numero - 1);
  const proximo = vizinhos.find((v) => v.numero === bimestre.numero + 1);

  if (bimestre.dataFim.getTime() <= bimestre.dataInicio.getTime()) {
    throw new BadRequestException(
      `Bimestre ${bimestre.numero} tem data fim anterior ou igual à data início.`,
    );
  }
  if (
    anterior &&
    bimestre.dataInicio.getTime() <= anterior.dataFim.getTime()
  ) {
    throw new BadRequestException(
      'Bimestres com datas sobrepostas ou fora da ordem crescente.',
    );
  }
  if (proximo && bimestre.dataFim.getTime() >= proximo.dataInicio.getTime()) {
    throw new BadRequestException(
      'Bimestres com datas sobrepostas ou fora da ordem crescente.',
    );
  }
}