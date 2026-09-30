import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// FIX H5 (production review): `reason` previously had zero validation (raw
// @Body('reason') string, no DTO), even though it is the audit trail for
// reopening an already-finalized financial paper (order_paper.reopen_reason).
export class ReopenPaperDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
