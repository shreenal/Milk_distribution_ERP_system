import { Transform } from 'class-transformer';
import { trimStringTransform } from '../../../../common/utils/trim-string.transform.js';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// PA-18 / PA-10.6: a mandatory, trimmed reason for admin overrides
// (revert morning submit, dismiss failed propagation). Same rule as reopen.
export class PaperReasonDto {
  @Transform(trimStringTransform)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
