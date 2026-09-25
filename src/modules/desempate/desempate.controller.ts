import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { DesempateService } from './desempate.service.js';
import { CriarDesempateDto } from './dto/criar-desempate.dto.js';

@Controller('competicoes')
@UseGuards(AuthGuard)
export class DesempateController {
  constructor(private readonly desempateService: DesempateService) {}

  @Post(':id/desempate')
  resolverManualmente(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) competicaoId: string,
    @Body() dto: CriarDesempateDto,
  ) {
    return this.desempateService.resolverManualmente(user, competicaoId, dto);
  }

  @Get(':id/desempate/pendencias')
  listarPendencias(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) competicaoId: string,
  ) {
    return this.desempateService.listarPendencias(user, competicaoId);
  }

  @Post(':id/desempate/aplicar-automatico')
  aplicarAutomatico(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) competicaoId: string,
    @Query('bimestreId', new ParseUUIDPipe({ optional: true }))
    bimestreId: string | undefined,
  ) {
    return this.desempateService.aplicarAutomatico(
      user,
      competicaoId,
      bimestreId,
    );
  }
}