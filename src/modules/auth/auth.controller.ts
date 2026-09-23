import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { TrocarSenhaDto } from './dto/trocar-senha.dto.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: UsuarioAutenticado) {
    return this.authService.me(user);
  }

  @Post('trocar-senha')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  trocarSenha(
    @CurrentUser() user: UsuarioAutenticado,
    @Body() dto: TrocarSenhaDto,
  ) {
    return this.authService.trocarSenha(user, dto);
  }
}