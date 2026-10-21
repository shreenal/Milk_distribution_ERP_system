import { Type } from 'class-transformer';
import {
  IsArray,
  ValidateNested,
  IsInt,
  IsNumber,
  Max,
  Min,
  ArrayMaxSize,
} from 'class-validator';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';
import { CASH_SETTLEMENT_LIMITS } from '../cash-settlement.constants.js';

const MAX_NOTES = CASH_SETTLEMENT_LIMITS.MAX_NOTE_COUNT;

export class SaveRouteDenominationsDto {
  @IsArray()
  @ArrayMaxSize(CASH_SETTLEMENT_LIMITS.MAX_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => RouteDenominationDto)
  denominations!: RouteDenominationDto[];

  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}

export class RouteDenominationDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  sheetId!: number;

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
