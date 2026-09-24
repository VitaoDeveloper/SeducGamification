import { Module } from '@nestjs/common';
import { GruposController } from './grupos.controller.js';
import { GruposService } from './grupos.service.js';

@Module({
  controllers: [GruposController],
  providers: [GruposService],
})
export class GruposModule {}