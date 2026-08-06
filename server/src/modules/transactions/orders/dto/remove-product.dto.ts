import { IsNumber, Min } from 'class-validator';

export class RemoveProductDto {
  @IsNumber()
  @Min(1)
  productId!: number;
}
