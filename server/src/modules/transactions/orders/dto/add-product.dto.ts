import { IsNumber, Min } from 'class-validator';

export class AddProductDto {
  @IsNumber()
  @Min(1)
  productId!: number;
}