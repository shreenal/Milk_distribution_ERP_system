import { IsInt, Min, Max } from 'class-validator';

import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';

export class AddProductDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId!: number;

  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
