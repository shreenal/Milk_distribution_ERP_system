import { PartialType } from '@nestjs/swagger';

import { CreateProductOrderUnitDto } from './create-product-order-unit.dto.js';

export class UpdateProductOrderUnitDto extends PartialType(
  CreateProductOrderUnitDto,
) {}
