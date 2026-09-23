import { Module } from '@nestjs/common';
import { LecionamentosController } from './lecionamentos.controller.js';
import { LecionamentosService } from './lecionamentos.service.js';

@Module({
  controllers: [LecionamentosController],
  providers: [LecionamentosService],
})
export class LecionamentosModule {}