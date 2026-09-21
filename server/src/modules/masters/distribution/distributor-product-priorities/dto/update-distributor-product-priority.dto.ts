import { PartialType } from '@nestjs/mapped-types';

import { CreateDistributorProductPriorityDto } from './create-distributor-product-priority.dto.js';

export class UpdateDistributorProductPriorityDto extends PartialType(
  CreateDistributorProductPriorityDto,
) {}
