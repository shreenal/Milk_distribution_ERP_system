import { PartialType } from '@nestjs/mapped-types';
import { CreateDistributorDto } from './create-distributor.dto.js';

export class UpdateDistributorDto extends PartialType(
  CreateDistributorDto,
) {}