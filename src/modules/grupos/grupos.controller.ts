import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { AdicionarMembroDto } from './dto/adicionar-membro.dto.js';
import { CriarGrupoDto } from './dto/criar-grupo.dto.js';
import { GruposService } from './grupos.service.js';

@Controller()
@UseGuards(AuthGuard)
export class GruposController {
  constructor(private readonly gruposService: GruposService) {}

  @Post('competicoes/:id/grupos')
  criarGrupo(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) competicaoId: string,
    @Body() dto: CriarGrupoDto,
  ) {
    return this.gruposService.criarGrupo(user, competicaoId, dto);
  }

  @Post('grupos/:id/membros')
  adicionarMembro(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) grupoId: string,
    @Body() dto: AdicionarMembroDto,
  ) {
    return this.gruposService.adicionarMembro(user, grupoId, dto);
  }

  @Delete('grupos/:id/membros/:alunoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removerMembro(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) grupoId: string,
    @Param('alunoId', ParseUUIDPipe) alunoId: string,
    @Query('bimestreId', new ParseUUIDPipe({ optional: true }))
    bimestreId: string | undefined,
  ) {
    return this.gruposService.removerMembro(
      user,
      grupoId,
      alunoId,
      bimestreId!,
    );
  }

  @Get('competicoes/:id/grupos')
  listarGruposComMembros(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) competicaoId: string,
    @Query('bimestreId', new ParseUUIDPipe({ optional: true }))
    bimestreId: string | undefined,
  ) {
    return this.gruposService.listarGruposComMembros(
      user,
      competicaoId,
      bimestreId,
    );
  }
}