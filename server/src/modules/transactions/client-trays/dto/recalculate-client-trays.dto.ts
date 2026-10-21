import { Matches } from 'class-validator';

// Sale-date window (inclusive) for the administrative recalculation.
export class RecalculateClientTraysRangeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fromDate must be in YYYY-MM-DD format',
  })
  fromDate!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'toDate must be in YYYY-MM-DD format',
  })
  toDate!: string;
}
