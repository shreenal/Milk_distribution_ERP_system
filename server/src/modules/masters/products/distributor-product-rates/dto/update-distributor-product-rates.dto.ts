import { PartialType } from '@nestjs/swagger';

import { CreateDistributorProductRatesDto } from './create-distributor-product-rates.dto.js';

export class UpdateDistributorProductRatesDto extends PartialType(
  CreateDistributorProductRatesDto,
) {}
