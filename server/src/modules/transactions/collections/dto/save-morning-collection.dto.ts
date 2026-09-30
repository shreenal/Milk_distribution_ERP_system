import {
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsNumber,
  IsOptional,
  IsString,
  IsISO8601,
  ArrayMaxSize,
} from 'class-validator';

import { Type } from 'class-transformer';

export class MorningCollectionEntryDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsNumber()
  @Min(0)
  cashCollection!: number;

  @IsNumber()
  @Min(0)
  chequeCollection!: number;

  @IsOptional()
  @IsString()
  employeeRemarks?: string;
}

export class SaveMorningCollectionsDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => MorningCollectionEntryDto)
  entries!: MorningCollectionEntryDto[];

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
