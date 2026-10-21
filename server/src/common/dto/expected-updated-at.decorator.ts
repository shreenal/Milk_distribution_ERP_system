import { applyDecorators } from '@nestjs/common';
import { IsDefined, IsISO8601, ValidateIf } from 'class-validator';
export const ExpectedUpdatedAt = () =>
  applyDecorators(
    ValidateIf(
      (o: { expectedUpdatedAt?: unknown }) => o.expectedUpdatedAt !== null,
    ),
    IsDefined(),
    IsISO8601({}, { message: 'Invalid expectedUpdatedAt' }),
  );
