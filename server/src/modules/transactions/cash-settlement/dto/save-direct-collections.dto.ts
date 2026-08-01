import { Type } from 'class-transformer';

import { IsArray, IsInt, IsNumber, ValidateNested } from 'class-validator';

export class DirectCollectionDto {
  @IsInt()
  employeeId!: number;

  @IsInt()
  note2000!: number;

  @IsInt()
  note500!: number;

  @IsInt()
  note200!: number;

  @IsInt()
  note100!: number;

  @IsInt()
  note50!: number;

  @IsInt()
  note20!: number;

  @IsInt()
  note10!: number;

  @IsNumber()
  coins!: number;
}

export class SaveDirectCollectionsDto {
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => DirectCollectionDto)
  directCollections!: DirectCollectionDto[];
}
