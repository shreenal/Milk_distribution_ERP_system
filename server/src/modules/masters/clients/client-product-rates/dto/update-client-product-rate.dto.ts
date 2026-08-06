import { PartialType } from '@nestjs/mapped-types';

import { CreateClientProductRateDto } from './create-client-product-rate.dto.js';

export class UpdateClientProductRateDto extends PartialType(
  CreateClientProductRateDto,
) {}
