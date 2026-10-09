import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CompeticoesService } from './competicoes.service.js';
import { AtualizarCompeticaoDto } from './dto/atualizar-competicao.dto.js';
import { CriarCompeticaoDto } from './dto/criar-competicao.dto.js';

@Controller()
@UseGuards(AuthGuard)
export class CompeticoesController {
  constructor(private readonly competicoesService: CompeticoesService) {}

  @Post('competicoes')
  criar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Body() dto: CriarCompeticaoDto,
  ) {
    return this.competicoesService.criar(user, dto);
  }

  @Get('competicoes/:id')
  detalhe(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.competicoesService.detalhe(user, id);
  }

  @Patch('competicoes/:id')
  atualizar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarCompeticaoDto,
  ) {
    return this.competicoesService.atualizar(user, id, dto);
  }

  @Delete('competicoes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  excluir(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.competicoesService.excluir(user, id);
  }

  @Get('lecionamentos/:id/competicoes')
  listarDoLecionamento(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.competicoesService.listarDoLecionamento(user, id);
  }
}