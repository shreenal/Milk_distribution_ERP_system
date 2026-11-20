import { BadRequestException } from '@nestjs/common';

// Each duplicated key is returned once, however many times it was sent (CD-5.5, D-16).
export function duplicateKeys<T>(
  entries: T[],
  keyOf: (entry: T) => string,
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const entry of entries) {
    const key = keyOf(entry);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }

  return [...duplicates];
}

export function assertNoDuplicateKeys<T>(
  entries: T[],
  keyOf: (entry: T) => string,
  message: (duplicates: string[]) => string,
): void {
  const duplicates = duplicateKeys(entries, keyOf);
  if (duplicates.length > 0) {
    throw new BadRequestException(message(duplicates));
  }
}
