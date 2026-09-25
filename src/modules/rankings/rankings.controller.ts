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
import { RankingsService } from './rankings.service.js';

@Controller('competicoes')
@UseGuards(AuthGuard)
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  @Get(':id/ranking')
  ranking(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) competicaoId: string,
    @Query('bimestreId', new ParseUUIDPipe({ optional: true }))
    bimestreId: string | undefined,
  ) {
    return this.rankingsService.ranking(user, competicaoId, bimestreId);
  }

  @Get(':id/ranking-individual')
  rankingIndividual(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) competicaoId: string,
  ) {
    return this.rankingsService.rankingIndividual(user, competicaoId);
  }
}