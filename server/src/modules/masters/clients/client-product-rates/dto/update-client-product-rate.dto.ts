import { PartialType } from '@nestjs/swagger';

import { CreateClientProductRateDto } from './create-client-product-rate.dto.js';

export class UpdateClientProductRateDto extends PartialType(
  CreateClientProductRateDto,
) {}
