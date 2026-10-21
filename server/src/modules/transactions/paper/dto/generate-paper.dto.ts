import { IsOptional, Matches } from 'class-validator';

// `date` is optional: papers are generated for the current business day only,
// so the server derives the date. If a client still sends one it must be a
// strict YYYY-MM-DD string and must equal the derived date (checked in the
// service, including calendar validity such as rejecting 2026-02-31).
export class GeneratePaperDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;
}
