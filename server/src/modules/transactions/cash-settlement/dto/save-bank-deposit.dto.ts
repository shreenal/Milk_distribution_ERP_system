import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class BankDepositDto {
  /**
   * Identifies an existing cash_bank_deposit row to update. Omit when
   * adding a new deposit. Required for correct matching because bankId
   * alone isn't unique — a paper can have multiple deposits to the same
   * bank.
   */
  @IsOptional()
  @IsInt()
  id?: number;

  @IsInt()
  bankId!: number;

  @IsInt()
  @Min(0)
  note2000!: number;

  @IsInt()
  @Min(0)
  note500!: number;

  @IsInt()
  @Min(0)
  note200!: number;

  @IsInt()
  @Min(0)
  note100!: number;

  @IsInt()
  @Min(0)
  note50!: number;

  @IsInt()
  @Min(0)
  note20!: number;

  @IsInt()
  @Min(0)
  note10!: number;

  @IsNumber()
  @Min(0)
  coins!: number;
}

export class SaveBankDepositsDto {
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => BankDepositDto)
  bankDeposits!: BankDepositDto[];

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
