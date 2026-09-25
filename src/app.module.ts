import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AlunosModule } from './modules/alunos/alunos.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BimestresModule } from './modules/bimestres/bimestres.module.js';
import { CompeticoesModule } from './modules/competicoes/competicoes.module.js';
import { ComponentesPontuacaoModule } from './modules/componentes-pontuacao/componentes-pontuacao.module.js';
import { DesempateModule } from './modules/desempate/desempate.module.js';
import { GruposModule } from './modules/grupos/grupos.module.js';
import { LancamentosModule } from './modules/lancamentos/lancamentos.module.js';
import { LecionamentosModule } from './modules/lecionamentos/lecionamentos.module.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { RankingsModule } from './modules/rankings/rankings.module.js';
import { RelatoriosModule } from './modules/relatorios/relatorios.module.js';
import { SalasModule } from './modules/salas/salas.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'seduc_gamification',
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    SalasModule,
    LecionamentosModule,
    AlunosModule,
    CompeticoesModule,
    GruposModule,
    ComponentesPontuacaoModule,
    LancamentosModule,
    BimestresModule,
    RankingsModule,
    DesempateModule,
    RelatoriosModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },
  ],
})
export class AppModule {}
