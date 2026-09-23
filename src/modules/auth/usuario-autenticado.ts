export const TIPO_USUARIO = {
  PROFESSOR: 'PROFESSOR',
  ALUNO: 'ALUNO',
} as const;

export type TipoUsuario = (typeof TIPO_USUARIO)[keyof typeof TIPO_USUARIO];

export interface UsuarioAutenticado {
  id: string;
  tipo: TipoUsuario;
}

export interface JwtPayload {
  sub: string;
  tipo: TipoUsuario;
}