import { IsISO8601 } from 'class-validator';

// FIX H5 (production review): this endpoint previously read `date` off the
// raw body with @Body('date'), which bypasses the global ValidationPipe
// entirely (it only validates class-based DTOs). Every other write endpoint
// in the codebase goes through a DTO; this brings paper generation in line.
export class GeneratePaperDto {
  @IsISO8601()
  date!: string;
}
