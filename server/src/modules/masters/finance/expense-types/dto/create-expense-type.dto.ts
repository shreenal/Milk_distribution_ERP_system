import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateExpenseTypeDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}