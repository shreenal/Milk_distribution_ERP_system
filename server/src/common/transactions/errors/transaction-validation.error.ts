import { BadRequestException } from '@nestjs/common';

export function transactionValidationError(
  message: string,
  details: string[] = [],
): BadRequestException {
  return new BadRequestException(
    details.length > 0 ? { message, details } : message,
  );
}
