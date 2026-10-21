import { TrimmedName } from '../../../../../common/dto/trimmed-name.decorator.js';

export class CreatePackagingTypeDto {
  @TrimmedName(100)
  name!: string;
}
