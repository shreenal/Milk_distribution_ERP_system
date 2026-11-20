import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';

// PD-23 / PD-25: the reason is trimmed before validation (same as ReopenPaperDto).
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RecalculatePurchaseRatesDto {
  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
