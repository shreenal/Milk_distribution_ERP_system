import { PartialType } from '@nestjs/swagger';
import { CreateProductGroupDto } from './create-product-group.dto.js';

export class UpdateProductGroupDto extends PartialType(CreateProductGroupDto) {}
