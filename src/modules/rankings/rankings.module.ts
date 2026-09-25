import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SintesesModule } from '../sinteses/sinteses.module.js';
import { RankingsController } from './rankings.controller.js';
import { RankingsService } from './rankings.service.js';

@Module({
  imports: [PrismaModule, SintesesModule],
  controllers: [RankingsController],
  providers: [RankingsService],
})
export class RankingsModule {}