import { IsInt } from 'class-validator';

export class UpdateClientCategoryDto {
  @IsInt()
  supplier_distributor_id!: number;
}
