import { Transform } from 'class-transformer';
import { trimStringTransform } from '../../../../common/utils/trim-string.transform.js';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// `date` is the SALE date and is optional. Without it the server generates the
// ordering paper (tomorrow, IST). A date before that is a backfill (PA-4.8):
// admin only, and `reason` is then mandatory (checked in the service).
// A future date is rejected. Calendar validity (2026-02-31) is checked in the
// service.
export class GeneratePaperDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;

  @IsOptional()
  @Transform(trimStringTransform)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason?: string;
}
