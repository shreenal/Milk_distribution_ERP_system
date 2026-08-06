import { PartialType } from '@nestjs/mapped-types';
import { CreateExpenseTypeDto } from './create-expense-type.dto.js';

export class UpdateExpenseTypeDto extends PartialType(CreateExpenseTypeDto) {}
