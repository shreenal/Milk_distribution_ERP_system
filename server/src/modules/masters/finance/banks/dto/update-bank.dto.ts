import { PartialType } from '@nestjs/mapped-types';
import { CreateBankDto } from './create-bank.dto.js';

export class UpdateBankDto extends PartialType(CreateBankDto) {}
