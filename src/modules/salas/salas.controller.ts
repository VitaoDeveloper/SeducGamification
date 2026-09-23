import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CriarSalaDto } from './dto/criar-sala.dto.js';
import { SalasService } from './salas.service.js';

@Controller('salas')
@UseGuards(AuthGuard)
export class SalasController {
  constructor(private readonly salasService: SalasService) {}

  @Post()
  criar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Body() dto: CriarSalaDto,
  ) {
    return this.salasService.criar(user, dto);
  }

  @Get()
  listar(@CurrentUser() user: UsuarioAutenticado | undefined) {
    return this.salasService.listarDoProfessor(user);
  }
}