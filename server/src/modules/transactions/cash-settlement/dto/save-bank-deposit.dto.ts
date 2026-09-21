import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
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
  note2000!: number;

  @IsInt()
  note500!: number;

  @IsInt()
  note200!: number;

  @IsInt()
  note100!: number;

  @IsInt()
  note50!: number;

  @IsInt()
  note20!: number;

  @IsInt()
  note10!: number;

  @IsNumber()
  coins!: number;
}

export class SaveBankDepositsDto {
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => BankDepositDto)
  bankDeposits!: BankDepositDto[];
}
