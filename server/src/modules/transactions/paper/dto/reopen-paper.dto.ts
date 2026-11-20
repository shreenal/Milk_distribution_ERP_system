import { Transform } from 'class-transformer';
import { trimStringTransform } from '../../../../common/utils/trim-string.transform.js';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// FIX H5 (production review): `reason` is the audit trail for reopening an
// already-finalized financial paper (order_paper.reopen_reason).
// Trimmed before validation so a whitespace-only reason is rejected.
export class ReopenPaperDto {
  @Transform(trimStringTransform)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
