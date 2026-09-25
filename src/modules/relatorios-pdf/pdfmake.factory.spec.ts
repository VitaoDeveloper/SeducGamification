import { describe, expect, it } from 'vitest';
import { gerarPdf } from './pdfmake.factory.js';

describe('gerarPdf', () => {
  it('gera um buffer de PDF válido para um documento mínimo', async () => {
    const buffer = await gerarPdf({
      content: [{ text: 'Relatório de exemplo', style: 'titulo' }],
      styles: { titulo: { fontSize: 14, bold: true } },
    });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});