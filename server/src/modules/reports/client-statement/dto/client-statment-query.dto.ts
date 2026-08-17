import { IsDateString, IsEnum } from 'class-validator';
import { SupplyCategory } from '../../../../generated/prisma/client.js';

export class ClientStatementQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsEnum(SupplyCategory)
  category!: SupplyCategory;
}
