import { SupplyCategory } from '../../../../../generated/prisma/client.js';
import { IsEnum } from 'class-validator';
import { TrimmedName } from '../../../../../common/dto/trimmed-name.decorator.js';

export class CreateProductGroupDto {
  @TrimmedName(100)
  name!: string;

  @IsEnum(SupplyCategory)
  category!: SupplyCategory;
}
