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
import { Type } from 'class-transformer';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';
import { CASH_SETTLEMENT_LIMITS } from '../cash-settlement.constants.js';

export class RouteExpenseDto {
  // CS-6.2: with an id the line is updated in place (stable id); without one it is added.
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  sheetId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  expenseTypeId!: number;

  // CS-5.4: zero is rejected (S13); the cap is a placeholder (CS-16.1).
  @IsNumber()
  @Min(CASH_SETTLEMENT_LIMITS.MIN_EXPENSE_AMOUNT)
  @Max(CASH_SETTLEMENT_LIMITS.MAX_EXPENSE_AMOUNT)
  amount!: number;
}

export class SaveRouteExpensesDto {
  @IsArray()
  @ArrayMaxSize(CASH_SETTLEMENT_LIMITS.MAX_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => RouteExpenseDto)
  expenses!: RouteExpenseDto[];

  // CS-6.3: nothing is deleted by omission; deletion is explicit, by saved line id.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CASH_SETTLEMENT_LIMITS.MAX_ENTRIES)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  deletedExpenseIds?: number[];

  // CS-10.1: required. Only an explicit null passes the DTO (and is a 409).
  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
