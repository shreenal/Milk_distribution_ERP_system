import { Type } from 'class-transformer';
import { IsISO8601, IsOptional, ValidateNested } from 'class-validator';

import { SaveDairyTrayEntryDto } from './save-dairy-tray-entry.dto.js';

export class SaveDairyTrayEntriesDto {
  @ValidateNested({ each: true })
  @Type(() => SaveDairyTrayEntryDto)
  entries!: SaveDairyTrayEntryDto[];

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
