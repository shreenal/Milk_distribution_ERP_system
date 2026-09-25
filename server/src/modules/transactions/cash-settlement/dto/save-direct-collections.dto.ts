import { Type } from 'class-transformer';

import {
  IsArray,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class DirectCollectionDto {
  @IsInt()
  employeeId!: number;

  @IsInt()
  @Min(0)
  note2000!: number;

  @IsInt()
  @Min(0)
  note500!: number;

  @IsInt()
  @Min(0)
  note200!: number;

  @IsInt()
  @Min(0)
  note100!: number;

  @IsInt()
  @Min(0)
  note50!: number;

  @IsInt()
  @Min(0)
  note20!: number;

  @IsInt()
  @Min(0)
  note10!: number;

  @IsNumber()
  @Min(0)
  coins!: number;
}

export class SaveDirectCollectionsDto {
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => DirectCollectionDto)
  directCollections!: DirectCollectionDto[];

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
