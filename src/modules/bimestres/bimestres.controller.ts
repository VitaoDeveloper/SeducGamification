import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { BimestresService } from './bimestres.service.js';

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
}
