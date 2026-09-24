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
import { ComponentesPontuacaoService } from './componentes-pontuacao.service.js';
import { CriarComponentePontuacaoDto } from './dto/criar-componente-pontuacao.dto.js';

@Controller('bimestres')
@UseGuards(AuthGuard)
export class ComponentesPontuacaoController {
  constructor(
    private readonly componentesPontuacaoService: ComponentesPontuacaoService,
  ) {}

  @Post(':id/componentes-pontuacao')
  criar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) bimestreId: string,
    @Body() dto: CriarComponentePontuacaoDto,
  ) {
    return this.componentesPontuacaoService.criar(user, bimestreId, dto);
  }

  @Get(':id/componentes-pontuacao')
  listar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) bimestreId: string,
  ) {
    return this.componentesPontuacaoService.listar(user, bimestreId);
  }

  @Post(':id/componentes-pontuacao/validar')
  validar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) bimestreId: string,
  ) {
    return this.componentesPontuacaoService.validar(user, bimestreId);
  }
}