import { PartialType } from '@nestjs/mapped-types';

import { CreateDistributorProductRatesDto } from './create-distributor-product-rates.dto.js';

export class UpdateDistributorProductRatesDto extends PartialType(
  CreateDistributorProductRatesDto,
) {}