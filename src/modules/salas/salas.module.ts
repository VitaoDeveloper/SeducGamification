import { Module } from '@nestjs/common';
import { SalasController } from './salas.controller.js';
import { SalasService } from './salas.service.js';

@Module({
  controllers: [SalasController],
  providers: [SalasService],
})
export class SalasModule {}