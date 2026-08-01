import { SupplyCategory } from '../../../../../generated/prisma/client.js';
import { IsEnum, IsString, MaxLength } from 'class-validator';

export class CreateProductGroupDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsEnum(SupplyCategory)
  category!: SupplyCategory;
}