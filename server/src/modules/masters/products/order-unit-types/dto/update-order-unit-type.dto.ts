import { PartialType } from '@nestjs/swagger';

import { CreateOrderUnitTypeDto } from './create-order-unit-type.dto.js';

export class UpdateOrderUnitTypeDto extends PartialType(
  CreateOrderUnitTypeDto,
) {}
