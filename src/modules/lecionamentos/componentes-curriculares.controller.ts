import {
  Body,
  Controller,
  Delete,
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
import { AtualizarComponenteCurricularDto } from './dto/atualizar-componente-curricular.dto.js';
import { CriarComponenteCurricularDto } from './dto/criar-componente-curricular.dto.js';
import { LecionamentosService } from './lecionamentos.service.js';

@Controller()
@UseGuards(AuthGuard)
export class ComponentesCurricularesController {
  constructor(private readonly lecionamentosService: LecionamentosService) {}

  @Post('lecionamentos/:id/componentes-curriculares')
  adicionar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CriarComponenteCurricularDto,
  ) {
    return this.lecionamentosService.adicionarComponente(user, id, dto);
  }

  @Patch('componentes-curriculares/:id')
  renomear(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarComponenteCurricularDto,
  ) {
    return this.lecionamentosService.renomearComponente(user, id, dto);
  }

  @Delete('componentes-curriculares/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remover(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.lecionamentosService.removerComponente(user, id);
  }

  @Delete('lecionamentos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  desinscrever(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.lecionamentosService.desinscrever(user, id);
  }
}
