import { Module } from '@nestjs/common';
import { EscolasController } from './escolas.controller.js';
import { EscolasService } from './escolas.service.js';

@Module({
  controllers: [EscolasController],
  providers: [EscolasService],
})
export class EscolasModule {}
