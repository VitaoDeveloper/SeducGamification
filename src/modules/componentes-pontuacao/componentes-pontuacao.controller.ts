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
import { AtualizarComponentePontuacaoDto } from './dto/atualizar-componente-pontuacao.dto.js';
import { CriarComponentePontuacaoDto } from './dto/criar-componente-pontuacao.dto.js';
import { ComponentesPontuacaoService } from './componentes-pontuacao.service.js';

@Controller()
@UseGuards(AuthGuard)
export class ComponentesPontuacaoController {
  constructor(
    private readonly componentesPontuacaoService: ComponentesPontuacaoService,
  ) {}

  @Post('bimestres/:id/componentes-pontuacao')
  criar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) bimestreId: string,
    @Body() dto: CriarComponentePontuacaoDto,
  ) {
    return this.componentesPontuacaoService.criar(user, bimestreId, dto);
  }

  @Get('bimestres/:id/componentes-pontuacao')
  listar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) bimestreId: string,
  ) {
    return this.componentesPontuacaoService.listar(user, bimestreId);
  }

  @Post('bimestres/:id/componentes-pontuacao/validar')
  validar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) bimestreId: string,
  ) {
    return this.componentesPontuacaoService.validar(user, bimestreId);
  }

  @Patch('componentes-pontuacao/:id')
  atualizar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarComponentePontuacaoDto,
  ) {
    return this.componentesPontuacaoService.atualizar(user, id, dto);
  }

  @Delete('componentes-pontuacao/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  excluir(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.componentesPontuacaoService.excluir(user, id);
  }
}