import { Module } from '@nestjs/common';
import { ComponentesCurricularesController } from './componentes-curriculares.controller.js';
import { LecionamentosController } from './lecionamentos.controller.js';
import { LecionamentosService } from './lecionamentos.service.js';

@Module({
  controllers: [LecionamentosController, ComponentesCurricularesController],
  providers: [LecionamentosService],
})
export class LecionamentosModule {}