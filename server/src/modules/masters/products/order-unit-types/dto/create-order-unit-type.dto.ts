import { TrimmedName } from '../../../../../common/dto/trimmed-name.decorator.js';

export class CreateOrderUnitTypeDto {
  @TrimmedName(50)
  name!: string;
}
