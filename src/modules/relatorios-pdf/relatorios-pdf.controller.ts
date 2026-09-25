import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { RelatoriosPdfService } from './relatorios-pdf.service.js';

@Controller()
@UseGuards(AuthGuard)
export class RelatoriosPdfController {
  constructor(private readonly relatoriosPdfService: RelatoriosPdfService) {}

  @Get('alunos/:id/relatorio-individual.pdf')
  async relatorioIndividual(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) alunoId: string,
    @Query('competicaoId', new ParseUUIDPipe({ optional: true }))
    competicaoId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.relatoriosPdfService.individual(
      user,
      alunoId,
      competicaoId,
    );
    this.enviarPdf(res, buffer, `relatorio-individual-${alunoId}.pdf`);
  }

  @Get('alunos/:id/relatorio-comparativo-grupo.pdf')
  async relatorioComparativoGrupo(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) alunoId: string,
    @Query('competicaoId', new ParseUUIDPipe({ optional: true }))
    competicaoId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.relatoriosPdfService.comparativoGrupo(
      user,
      alunoId,
      competicaoId,
    );
    this.enviarPdf(res, buffer, `relatorio-comparativo-grupo-${alunoId}.pdf`);
  }

  @Get('grupos/:id/relatorio.pdf')
  async relatorioGrupo(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) grupoId: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.relatoriosPdfService.grupo(user, grupoId);
    this.enviarPdf(res, buffer, `relatorio-grupo-${grupoId}.pdf`);
  }

  @Get('grupos/:id/relatorio-comparativo.pdf')
  async relatorioComparativoGrupos(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) grupoId: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.relatoriosPdfService.comparativoGrupos(user, grupoId);
    this.enviarPdf(res, buffer, `relatorio-comparativo-grupos-${grupoId}.pdf`);
  }

  private enviarPdf(res: Response, buffer: Buffer, arquivo: string): void {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  }
}