import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { BimestresService } from './bimestres.service.js';
import { AtualizarBimestreDto } from './dto/atualizar-bimestre.dto.js';

@Controller('bimestres')
@UseGuards(AuthGuard)
export class BimestresController {
  constructor(private readonly bimestresService: BimestresService) {}

  @Post(':id/encerrar')
  encerrar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) bimestreId: string,
  ) {
    return this.bimestresService.encerrar(user, bimestreId);
  }

  @Patch(':id')
  atualizar(
    @CurrentUser() user: UsuarioAutenticado | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarBimestreDto,
  ) {
    return this.bimestresService.atualizar(user, id, dto);
  }
}
