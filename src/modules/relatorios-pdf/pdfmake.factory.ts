import { createRequire } from 'node:module';

/*
 * pdfmake foi escolhido para os PDFs por gerar documentos de forma
 * declarativa (sem renderizar HTML/CSS), em JavaScript puro, sem depender de
 * um binário de Chromium (puppeteer/@sparticuz/chromium) — o que evita custo
 * e complexidade de deploy no ambiente servidor do alpha.
 *
 * O pacote expõe um bundle UMD úmico (a instância da biblioteca), então ele é
 * carregado via createRequire para preservar a tipagem dos @types/pdfmake.
 */
const require = createRequire(import.meta.url);

type ModuloPdfMake = typeof import('pdfmake/build/pdfmake.js');

const pdfMake = require('pdfmake/build/pdfmake.js') as ModuloPdfMake;
const vfs = require('pdfmake/build/vfs_fonts.js') as typeof import('pdfmake/build/vfs_fonts.js');

// Fonte padrão (Roboto) embutida no virtual file system do pdfmake.
pdfMake.addVirtualFileSystem(vfs);
pdfMake.setFonts({
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
});

export type DefinicaoPdf = Parameters<ModuloPdfMake['createPdf']>[0];

/** Item único de conteúdo utilizado nos construtores de documento. */
export type ItemDeConteudo = DefinicaoPdf['content'] extends ReadonlyArray<infer E>
  ? E
  : never;

/**
 * Gera o buffer binário do PDF (Content-Type: application/pdf). Recebe um
 * objeto "solto" intencionalmente: os construtores de documento usam suas
 * próprias tipagens locais, e a validação estrutural é definição do pdfmake.
 */
export async function gerarPdf(definicao: object): Promise<Buffer> {
  const buffer = await pdfMake.createPdf(
    definicao as unknown as DefinicaoPdf,
  ).getBuffer();
  // O bundle UMD usa um polyfill de Buffer (pacote "buffer"); normaliza para o
  // Buffer nativo do Node para evitar incompatibilidades no envio (Content-Length etc.).
  return Buffer.from(buffer);
}