import {
  IsBoolean,
  IsInt,
  IsOptional,
} from 'class-validator';

export class CreateTransferRuleDto {
  @IsInt()
  supplier_distributor_id!: number;

  @IsInt()
  owner_distributor_id!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}