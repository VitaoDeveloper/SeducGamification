import { Module } from '@nestjs/common';
import { CompeticoesController } from './competicoes.controller.js';
import { CompeticoesService } from './competicoes.service.js';

@Module({
  controllers: [CompeticoesController],
  providers: [CompeticoesService],
})
export class CompeticoesModule {}