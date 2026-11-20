export function uniqueConflictDetails(details: string[]): string[] {
  return [...new Set(details)];
}
