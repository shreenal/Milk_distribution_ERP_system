import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  Max,
  Min,
} from 'class-validator';

// PA-17: marks (or unmarks) routes that have no business on this paper.
export class SetSheetsNoOperationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  sheetIds!: number[];

  @IsBoolean()
  noOperation!: boolean;
}
