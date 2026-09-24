import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { LancarNotaDto } from './dto/lancar-nota.dto.js';
import { LancarNotasLoteDto } from './dto/lancar-notas-lote.dto.js';
import { LancamentosService } from './lancamentos.service.js';

@Controller('componentes-pontuacao')
@UseGuards(AuthGuard)
export class LancamentosController {
  constructor(private readonly lancamentosService: LancamentosService) {}

  @Post(':id/lancamentos')
  lancar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) componentePontuacaoId: string,
    @Body() dto: LancarNotaDto,
  ) {
    return this.lancamentosService.lancar(
      user,
      componentePontuacaoId,
      dto,
    );
  }

  @Get(':id/lancamentos')
  listar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) componentePontuacaoId: string,
  ) {
    return this.lancamentosService.listar(user, componentePontuacaoId);
  }

  @Post(':id/lancamentos/lote')
  lancarLote(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) componentePontuacaoId: string,
    @Body() dto: LancarNotasLoteDto,
  ) {
    return this.lancamentosService.lancarLote(
      user,
      componentePontuacaoId,
      dto,
    );
  }
}