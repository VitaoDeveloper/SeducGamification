import { Module } from '@nestjs/common';
import { SintesesModule } from '../sinteses/sinteses.module.js';
import { BimestresController } from './bimestres.controller.js';
import { BimestresService } from './bimestres.service.js';

@Module({
  imports: [SintesesModule],
  controllers: [BimestresController],
  providers: [BimestresService],
})
export class BimestresModule {}
