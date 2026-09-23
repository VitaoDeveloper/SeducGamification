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
import { AlunosService } from './alunos.service.js';
import { CriarAlunoDto } from './dto/criar-aluno.dto.js';

@Controller('salas')
@UseGuards(AuthGuard)
export class AlunosController {
  constructor(private readonly alunosService: AlunosService) {}

  @Post(':salaId/alunos')
  criar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('salaId', ParseUUIDPipe) salaId: string,
    @Body() dto: CriarAlunoDto,
  ) {
    return this.alunosService.criar(user, salaId, dto);
  }

  @Get(':salaId/alunos')
  listar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('salaId', ParseUUIDPipe) salaId: string,
  ) {
    return this.alunosService.listarDaSala(user, salaId);
  }
}