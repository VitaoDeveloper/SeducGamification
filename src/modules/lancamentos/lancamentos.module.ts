import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LancamentosController } from './lancamentos.controller.js';
import { LancamentosService } from './lancamentos.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [LancamentosController],
  providers: [LancamentosService],
})
export class LancamentosModule {}