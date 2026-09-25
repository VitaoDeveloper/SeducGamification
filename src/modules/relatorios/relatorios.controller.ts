import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { RelatoriosService } from './relatorios.service.js';

@Controller()
@UseGuards(AuthGuard)
export class RelatoriosController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get('alunos/:id/relatorio-individual')
  relatorioIndividual(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) alunoId: string,
    @Query('competicaoId', new ParseUUIDPipe({ optional: true }))
    competicaoId?: string,
  ) {
    return this.relatoriosService.relatorioIndividual(
      user,
      alunoId,
      competicaoId,
    );
  }

  @Get('alunos/:id/relatorio-comparativo-grupo')
  relatorioComparativoGrupo(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) alunoId: string,
    @Query('competicaoId', new ParseUUIDPipe({ optional: true }))
    competicaoId?: string,
  ) {
    return this.relatoriosService.relatorioComparativoGrupo(
      user,
      alunoId,
      competicaoId,
    );
  }

  @Get('grupos/:id/relatorio')
  relatorioGrupo(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) grupoId: string,
  ) {
    return this.relatoriosService.relatorioGrupo(user, grupoId);
  }

  @Get('grupos/:id/relatorio-comparativo')
  relatorioComparativoGrupos(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) grupoId: string,
  ) {
    return this.relatoriosService.relatorioComparativoGrupos(user, grupoId);
  }
}