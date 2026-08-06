import { IsString, MaxLength } from 'class-validator';

export class CreatePackagingTypeDto {
  @IsString()
  @MaxLength(100)
  name!: string;
}
