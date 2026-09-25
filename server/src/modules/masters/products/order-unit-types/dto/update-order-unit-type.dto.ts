import { PartialType } from '@nestjs/mapped-types';

import { CreateOrderUnitTypeDto } from './create-order-unit-type.dto.js';

export class UpdateOrderUnitTypeDto extends PartialType(
  CreateOrderUnitTypeDto,
) {}
