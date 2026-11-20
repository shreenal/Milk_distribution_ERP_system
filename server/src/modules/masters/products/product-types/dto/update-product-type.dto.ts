import { PartialType } from '@nestjs/swagger';
import { CreateProductTypeDto } from './create-product-type.dto.js';

export class UpdateProductTypeDto extends PartialType(CreateProductTypeDto) {}
