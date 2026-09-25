import { PartialType } from '@nestjs/mapped-types';

import { CreateProductOrderUnitDto } from './create-product-order-unit.dto.js';

export class UpdateProductOrderUnitDto extends PartialType(
  CreateProductOrderUnitDto,
) {}
