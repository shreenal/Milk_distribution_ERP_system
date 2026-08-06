import { IsEnum, IsInt } from 'class-validator';

import { SupplyCategory } from '../../../../../generated/prisma/client.js';

export class CreateClientCategoryDto {
  @IsInt()
  client_id!: number;

  @IsEnum(SupplyCategory)
  category!: SupplyCategory;
}
