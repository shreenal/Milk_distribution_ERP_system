import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';
import { CollectionAmount } from '../collection-amount.decorator.js';

export class AdminCollectionEntryDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  clientId!: number;

  @CollectionAmount()
  onlineCollection?: number | null;

  @CollectionAmount()
  bankDeposit?: number | null;
}

export class SaveAdminCollectionsDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => AdminCollectionEntryDto)
  entries!: AdminCollectionEntryDto[];

  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
