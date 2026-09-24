import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ComponentesPontuacaoController } from './componentes-pontuacao.controller.js';
import { ComponentesPontuacaoService } from './componentes-pontuacao.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ComponentesPontuacaoController],
  providers: [ComponentesPontuacaoService],
})
export class ComponentesPontuacaoModule {}