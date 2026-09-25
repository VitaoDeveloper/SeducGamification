import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SintesesModule } from '../sinteses/sinteses.module.js';
import { DesempateAutomaticoService } from './desempate-automatico.service.js';
import { DesempateController } from './desempate.controller.js';
import { DesempateService } from './desempate.service.js';

@Module({
  imports: [PrismaModule, SintesesModule],
  controllers: [DesempateController],
  providers: [DesempateService, DesempateAutomaticoService],
})
export class DesempateModule {}