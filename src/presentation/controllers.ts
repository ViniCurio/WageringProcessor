import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { WalletService } from "../application/wallet.service";
import { WageringService } from "../application/wagering.service";
import { TransactionQueryService } from "../application/transaction-query.service";
import { CreateWalletDto, LedgerQueryDto, SubmitWagerDto } from "./dto";
import { InvalidRequestError } from "../domain/errors";
import { WagerTransactionStatus } from "../domain/wager-transaction";
import { SqsClientService } from "../infrastructure/messaging/sqs.service";

@Controller("wallets")
export class WalletController {
  constructor(private readonly service: WalletService) {}

  @Post() create(@Body() dto: CreateWalletDto) {
    return this.service.create(dto.playerId, dto.initialBalance);
  }

  @Get(":walletId") get(
    @Param("walletId", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.get(id);
  }

  @Get(":walletId/ledger") ledger(
    @Param("walletId", new ParseUUIDPipe()) id: string,
    @Query() query: LedgerQueryDto,
  ) {
    return this.service.ledger(id, query.cursor, query.limit);
  }

  @Post(":walletId/reconciliation") reconcile(
    @Param("walletId", new ParseUUIDPipe()) id: string,
  ) {
    return this.service.reconcile(id);
  }
}

@Controller("wagering/transactions")
export class WagerController {
  constructor(
    private readonly service: WageringService,
    private readonly queries: TransactionQueryService,
  ) {}

  @Post() async submit(
    @Body() dto: SubmitWagerDto,
    @Headers("idempotency-key") key: string | undefined,
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!key)
      throw new InvalidRequestError("Idempotency-Key header is required");
    const result = await this.service.execute({
      ...dto,
      idempotencyKey: key,
      correlationId: correlationId ?? randomUUID(),
    });
    res.status(
      result.status === WagerTransactionStatus.PendingReference
        ? 202
        : result.status === WagerTransactionStatus.Rejected
          ? 422
          : 200,
    );
    return result;
  }

  @Get(":transactionId") get(
    @Param("transactionId", new ParseUUIDPipe()) id: string,
  ) {
    return this.queries.byId(id);
  }
}

@Controller("providers/:providerId/wagering/transactions")
export class ProviderTransactionController {
  constructor(private readonly queries: TransactionQueryService) {}

  @Get(":externalTransactionId") get(
    @Param("providerId") providerId: string,
    @Param("externalTransactionId") externalTransactionId: string,
  ) {
    return this.queries.byExternalId(providerId, externalTransactionId);
  }
}

@Controller("health")
export class HealthController {
  constructor(
    private readonly em: EntityManager,
    private readonly sqs: SqsClientService,
  ) {}

  @Get("live") live() {
    return { status: "ok" };
  }

  @Get("ready") async ready() {
    await this.em.getConnection().execute("select 1");
    await this.sqs.ready();
    return { status: "ok" };
  }
}
