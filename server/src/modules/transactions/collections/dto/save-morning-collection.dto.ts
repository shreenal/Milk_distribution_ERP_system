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

export class MorningCollectionEntryDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  clientId!: number;

  @CollectionAmount()
  cashCollection?: number | null;

  @CollectionAmount()
  chequeCollection?: number | null;
}

export class SaveMorningCollectionsDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => MorningCollectionEntryDto)
  entries!: MorningCollectionEntryDto[];

  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
