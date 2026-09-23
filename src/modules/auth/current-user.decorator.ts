import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UsuarioAutenticado } from './usuario-autenticado.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioAutenticado | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: UsuarioAutenticado }>();
    return request.user;
  },
);