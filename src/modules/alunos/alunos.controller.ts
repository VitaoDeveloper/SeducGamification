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
import { AlunosService } from './alunos.service.js';
import { AtualizarAlunoDto } from './dto/atualizar-aluno.dto.js';
import { CriarAlunoDto } from './dto/criar-aluno.dto.js';

@Controller()
@UseGuards(AuthGuard)
export class AlunosController {
  constructor(private readonly alunosService: AlunosService) {}

  @Post('salas/:salaId/alunos')
  criar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('salaId', ParseUUIDPipe) salaId: string,
    @Body() dto: CriarAlunoDto,
  ) {
    return this.alunosService.criar(user, salaId, dto);
  }

  @Get('salas/:salaId/alunos')
  listar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('salaId', ParseUUIDPipe) salaId: string,
  ) {
    return this.alunosService.listarDaSala(user, salaId);
  }

  @Patch('alunos/:id')
  atualizar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarAlunoDto,
  ) {
    return this.alunosService.atualizar(user, id, dto);
  }

  @Delete('alunos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  excluir(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alunosService.excluir(user, id);
  }
}