import { IsNumber, Max, Min } from 'class-validator';
import { QUANTITY_PRECISION } from '../orders.constants.js';

export class SaveNightEntriesDto {
  @IsNumber()
  @Min(1)
  clientId!: number;

  @IsNumber()
  @Min(1)
  productId!: number;

  @IsNumber()
  @Min(0)
  @Max(QUANTITY_PRECISION.MAX_ORDERED_QTY)
  orderedQty!: number;
}
