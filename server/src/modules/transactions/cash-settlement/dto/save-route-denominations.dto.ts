import { Type } from 'class-transformer';
import {
  IsArray,
  ValidateNested,
  IsInt,
  IsNumber,
  IsISO8601,
  IsOptional,
  Min,
} from 'class-validator';

export class SaveRouteDenominationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteDenominationDto)
  denominations!: RouteDenominationDto[];

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class RouteDenominationDto {
  @IsInt()
  sheetId!: number;

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
