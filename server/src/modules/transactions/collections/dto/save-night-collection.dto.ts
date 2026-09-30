import {
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsNumber,
  IsISO8601,
  IsOptional,
  ArrayMaxSize,
} from 'class-validator';

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
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => NightCollectionEntryDto)
  entries!: NightCollectionEntryDto[];

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
