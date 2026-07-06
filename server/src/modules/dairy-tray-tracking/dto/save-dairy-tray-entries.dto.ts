import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { SaveDairyTrayEntryDto } from './save-dairy-tray-entry.dto.js';

export class SaveDairyTrayEntriesDto {
  @ValidateNested({ each: true })
  @Type(() => SaveDairyTrayEntryDto)
  entries!: SaveDairyTrayEntryDto[];
}
