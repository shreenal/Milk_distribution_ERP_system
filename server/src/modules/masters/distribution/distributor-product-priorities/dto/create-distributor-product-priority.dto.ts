import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class CreateDistributorProductPriorityDto {
  @IsInt()
  group_id!: number;

  @IsInt()
  product_id!: number;

  @IsInt()
  distributor_id!: number;

  @IsInt()
  priority!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
