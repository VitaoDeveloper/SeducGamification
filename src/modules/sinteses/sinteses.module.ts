import { Module } from '@nestjs/common';
import { SinteseCalculoService } from './sintese-calculo.service.js';

@Module({
  providers: [SinteseCalculoService],
  exports: [SinteseCalculoService],
})
export class SintesesModule {}
