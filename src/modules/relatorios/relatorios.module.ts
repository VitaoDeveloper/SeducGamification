import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SintesesModule } from '../sinteses/sinteses.module.js';
import { RelatoriosController } from './relatorios.controller.js';
import { RelatoriosService } from './relatorios.service.js';

@Module({
  imports: [PrismaModule, SintesesModule],
  controllers: [RelatoriosController],
  providers: [RelatoriosService],
  exports: [RelatoriosService],
})
export class RelatoriosModule {}