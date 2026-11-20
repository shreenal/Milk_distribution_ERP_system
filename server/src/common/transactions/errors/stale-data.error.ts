import { ConflictException } from '@nestjs/common';

export function staleDataConflict(message: string): ConflictException {
  return new ConflictException(message);
}
