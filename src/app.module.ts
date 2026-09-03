import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { ScheduleModule } from "@nestjs/schedule";
import config from "../mikro-orm.config";
import { PersistencePort } from "./application/persistence.port";
import { PendingReferenceService } from "./application/pending-reference.service";
import { TransactionQueryService } from "./application/transaction-query.service";
import { WageringService } from "./application/wagering.service";
import { WalletService } from "./application/wallet.service";
import { entities } from "./infrastructure/database/entities";
import { MikroOrmPersistenceAdapter } from "./infrastructure/database/persistence.adapter";
import { SqsClientService } from "./infrastructure/messaging/sqs.service";
import {
  OutboxWorker,
  PendingReferenceWorker,
  WagerConsumer,
} from "./infrastructure/workers";
import { MetricsController, MetricsService } from "./observability";
import { NoOpAuthGuard } from "./presentation/auth.guard";
import {
  HealthController,
  ProviderTransactionController,
  WagerController,
  WalletController,
} from "./presentation/controllers";

@Module({
  imports: [
    MikroOrmModule.forRoot(config),
    MikroOrmModule.forFeature(entities),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    WalletController,
    WagerController,
    ProviderTransactionController,
    HealthController,
    MetricsController,
  ],
  providers: [
    MikroOrmPersistenceAdapter,
    { provide: PersistencePort, useExisting: MikroOrmPersistenceAdapter },
    WalletService,
    WageringService,
    PendingReferenceService,
    TransactionQueryService,
    SqsClientService,
    MetricsService,
    OutboxWorker,
    PendingReferenceWorker,
    WagerConsumer,
    { provide: APP_GUARD, useClass: NoOpAuthGuard },
  ],
})
export class AppModule {}
