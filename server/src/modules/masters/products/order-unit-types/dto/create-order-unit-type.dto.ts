import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateOrderUnitTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;
}

