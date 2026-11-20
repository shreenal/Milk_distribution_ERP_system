import { PartialType } from '@nestjs/swagger';

import { CreateProductLinksDto } from './create-product-links.dto.js';

export class UpdateProductLinksDto extends PartialType(CreateProductLinksDto) {}
