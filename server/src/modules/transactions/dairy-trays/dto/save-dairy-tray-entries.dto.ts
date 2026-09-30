import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsISO8601,
  IsOptional,
  ValidateNested,
} from 'class-validator';

import { SaveDairyTrayEntryDto } from './save-dairy-tray-entry.dto.js';

export class SaveDairyTrayEntriesDto {
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => SaveDairyTrayEntryDto)
  entries!: SaveDairyTrayEntryDto[];

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
