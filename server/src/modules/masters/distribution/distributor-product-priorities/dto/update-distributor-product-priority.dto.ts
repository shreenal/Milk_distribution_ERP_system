import { PartialType } from '@nestjs/swagger';

import { CreateDistributorProductPriorityDto } from './create-distributor-product-priority.dto.js';

export class UpdateDistributorProductPriorityDto extends PartialType(
  CreateDistributorProductPriorityDto,
) {}
