import { IsDateString } from 'class-validator';

export class DayReportQueryDto {
  @IsDateString()
  date!: string;
}
