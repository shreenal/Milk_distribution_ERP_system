import { IsOptional, IsISO8601 } from 'class-validator';

export class GenerateTransferDto {
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
