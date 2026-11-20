import { PartialType } from '@nestjs/swagger';
import { CreateDistributorDto } from './create-distributor.dto.js';

export class UpdateDistributorDto extends PartialType(CreateDistributorDto) {}
