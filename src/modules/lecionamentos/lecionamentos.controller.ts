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
import { InscricaoLecionamentoDto } from './dto/inscricao-lecionamento.dto.js';
import { LecionamentosService } from './lecionamentos.service.js';

@Controller('salas')
@UseGuards(AuthGuard)
export class LecionamentosController {
  constructor(private readonly lecionamentosService: LecionamentosService) {}

  @Post(':salaId/inscricao')
  inscrever(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('salaId', ParseUUIDPipe) salaId: string,
    @Body() dto: InscricaoLecionamentoDto,
  ) {
    return this.lecionamentosService.inscrever(user, salaId, dto);
  }

  @Get(':salaId/lecionamentos')
  listar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('salaId', ParseUUIDPipe) salaId: string,
  ) {
    return this.lecionamentosService.listarDaSala(user, salaId);
  }
}