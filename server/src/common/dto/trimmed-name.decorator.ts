import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Trims the value, then requires a non-empty string (optionally capped). */
export const TrimmedName = (maxLength?: number) =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsString(),
    IsNotEmpty(),
    ...(maxLength !== undefined ? [MaxLength(maxLength)] : []),
  );
