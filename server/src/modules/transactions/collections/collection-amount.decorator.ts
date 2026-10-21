import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateBy,
  ValidationArguments,
} from 'class-validator';
import { toDecimal } from '../../../common/utils/money.util.js';
import { COLLECTION_AMOUNT } from './collections.constants.js';

/**
 * CD-5: one rule for every money amount in Collections.
 *  - null / "" / omitted  => accepted, treated as 0 by the service (CD-5.1)
 *  - JSON number only, 0 .. COLLECTION_AMOUNT.MAX
 *  - at most 2 decimal places, rejected (never rounded) otherwise
 * The decimal check uses Decimal rather than class-validator's maxDecimalPlaces,
 * which throws on exponent-form numbers such as 1e-7.
 */
export const CollectionAmount = () =>
  applyDecorators(
    Transform(({ value }) => (value === '' ? null : value)),
    IsOptional(),
    IsNumber(
      { allowNaN: false, allowInfinity: false },
      { message: (a: ValidationArguments) => `${a.property} must be a number` },
    ),
    Min(0, {
      message: (a: ValidationArguments) => `${a.property} cannot be negative`,
    }),
    Max(COLLECTION_AMOUNT.MAX, {
      message: (a: ValidationArguments) =>
        `${a.property} cannot exceed ${COLLECTION_AMOUNT.MAX}`,
    }),
    ValidateBy({
      name: 'collectionAmountDecimals',
      validator: {
        validate: (value: unknown) =>
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          toDecimal(value).decimalPlaces() <=
            COLLECTION_AMOUNT.MAX_DECIMAL_PLACES,
        defaultMessage: (a?: ValidationArguments) =>
          `${a?.property} must have at most ${COLLECTION_AMOUNT.MAX_DECIMAL_PLACES} decimal places`,
      },
    }),
  );
