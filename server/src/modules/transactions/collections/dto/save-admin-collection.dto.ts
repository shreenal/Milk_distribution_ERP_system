import { Type } from 'class-transformer';
import {
  IsInt,
  Min,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsISO8601,
  ArrayMaxSize,
} from 'class-validator';

export class AdminCollectionEntryDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsNumber()
  @Min(0)
  onlineCollection!: number;

  @IsNumber()
  @Min(0)
  bankDeposit!: number;

  @IsOptional()
  @IsString()
  adminRemarks?: string;
}

export class SaveAdminCollectionsDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => AdminCollectionEntryDto)
  entries!: AdminCollectionEntryDto[];

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
