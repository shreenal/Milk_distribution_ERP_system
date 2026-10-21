import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';
import { CASH_SETTLEMENT_LIMITS } from '../cash-settlement.constants.js';

const MAX_NOTES = CASH_SETTLEMENT_LIMITS.MAX_NOTE_COUNT;

export class BankDepositDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  bankId!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_NOTES)
  note2000!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_NOTES)
  note500!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_NOTES)
  note200!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_NOTES)
  note100!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_NOTES)
  note50!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_NOTES)
  note20!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_NOTES)
  note10!: number;

  @IsNumber()
  @Min(0)
  @Max(CASH_SETTLEMENT_LIMITS.MAX_COIN_AMOUNT)
  coins!: number;
}

export class SaveBankDepositsDto {
  @IsArray()
  @ArrayMaxSize(CASH_SETTLEMENT_LIMITS.MAX_ENTRIES)
  @ValidateNested({
    each: true,
  })
  @Type(() => BankDepositDto)
  bankDeposits!: BankDepositDto[];

  // CS-9.3: nothing is deleted by omission; deletion is explicit, by deposit id.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CASH_SETTLEMENT_LIMITS.MAX_ENTRIES)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  deletedDepositIds?: number[];

  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
