import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';

import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';
import { MAX_SAVE_ENTRIES } from '../dairy-trays.constants.js';
import { SaveDairyTrayEntryDto } from './save-dairy-tray-entry.dto.js';

export class SaveDairyTrayEntriesDto {
  // DT-4.3: 1 to 5,000 entries. An empty array is rejected.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SAVE_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => SaveDairyTrayEntryDto)
  entries!: SaveDairyTrayEntryDto[];

  // DT-9.2: mandatory. Omitted = 400. Explicit null is only ever a 409 here,
  // because the header always carries a token (same contract as Client Trays).
  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
