import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RelatoriosModule } from '../relatorios/relatorios.module.js';
import { RelatoriosPdfController } from './relatorios-pdf.controller.js';
import { RelatoriosPdfService } from './relatorios-pdf.service.js';

@Module({
  imports: [PrismaModule, RelatoriosModule],
  controllers: [RelatoriosPdfController],
  providers: [RelatoriosPdfService],
})
export class RelatoriosPdfModule {}