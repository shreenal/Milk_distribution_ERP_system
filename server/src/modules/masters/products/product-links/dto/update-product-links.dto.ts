import { PartialType } from '@nestjs/mapped-types';

import { CreateProductLinksDto } from './create-product-links.dto.js';

export class UpdateProductLinksDto extends PartialType(
  CreateProductLinksDto,
) {}