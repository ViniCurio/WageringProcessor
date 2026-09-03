import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Matches,
  Min,
  NotEquals,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { WagerTransactionKind } from "../domain/wager-transaction";

export class MoneyDto {
  @IsString()
  @Matches(/^(0|[1-9]\d*)\.\d{2}$/)
  amount!: string;

  @IsString()
  @Matches(/^BRL$/)
  currency!: string;
}

export class CreateWalletDto {
  @IsUUID() playerId!: string;

  @ValidateNested()
  @Type(() => MoneyDto)
  initialBalance!: MoneyDto;
}

export class SubmitWagerDto {
  @IsString() providerId!: string;

  @IsString() externalTransactionId!: string;

  @IsUUID() playerId!: string;

  @IsUUID() walletId!: string;

  @IsString() roundId!: string;

  @IsString() gameId!: string;

  @IsEnum(WagerTransactionKind)
  @NotEquals(WagerTransactionKind.Opening)
  kind!: WagerTransactionKind;

  @ValidateNested()
  @Type(() => MoneyDto)
  money!: MoneyDto;

  @ValidateIf(
    (dto: SubmitWagerDto, value: unknown) =>
      dto.kind === WagerTransactionKind.Refund ||
      dto.kind === WagerTransactionKind.Rollback ||
      value !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  referenceExternalTransactionId?: string;
}

export class LedgerQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
