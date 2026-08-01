import { IsArray, ValidateNested, IsInt, Min, IsNumber } from 'class-validator';

import { Type } from 'class-transformer';

export class NightCollectionEntryDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsNumber()
  @Min(0)
  officeAmountGiven!: number;
}

export class SaveNightCollectionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NightCollectionEntryDto)
  entries!: NightCollectionEntryDto[];
}
