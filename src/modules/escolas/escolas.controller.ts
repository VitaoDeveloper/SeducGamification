import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { EscolasService } from './escolas.service.js';

@Controller('escolas')
@UseGuards(AuthGuard)
export class EscolasController {
  constructor(private readonly escolasService: EscolasService) {}

  @Get()
  listar(@CurrentUser() user: UsuarioAutenticado | undefined) {
    return this.escolasService.listarDoProfessor(user);
  }
}
