import { Module } from '@nestjs/common';
import { AlunosController } from './alunos.controller.js';
import { AlunosService } from './alunos.service.js';

@Module({
  controllers: [AlunosController],
  providers: [AlunosService],
})
export class AlunosModule {}