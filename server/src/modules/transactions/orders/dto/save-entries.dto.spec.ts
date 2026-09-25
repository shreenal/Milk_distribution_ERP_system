import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { SaveNightEntriesDto } from './save-night-entries.dto.js';
import { SaveMorningEntriesDto } from './save-morning-entries.dto.js';
import { AddProductDto } from './add-product.dto.js';
import { QUANTITY_PRECISION } from '../orders.constants.js';

describe('SaveNightEntriesDto', () => {
  it('accepts a valid entry', async () => {
    const dto = plainToInstance(SaveNightEntriesDto, {
      clientId: 1,
      productId: 2,
      orderedQty: 10,
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects clientId below 1', async () => {
    const dto = plainToInstance(SaveNightEntriesDto, {
      clientId: 0,
      productId: 2,
      orderedQty: 10,
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'clientId')).toBe(true);
  });

  it('rejects productId below 1', async () => {
    const dto = plainToInstance(SaveNightEntriesDto, {
      clientId: 1,
      productId: 0,
      orderedQty: 10,
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'productId')).toBe(true);
  });

  it('rejects a negative orderedQty', async () => {
    const dto = plainToInstance(SaveNightEntriesDto, {
      clientId: 1,
      productId: 2,
      orderedQty: -1,
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'orderedQty')).toBe(true);
  });

  it('rejects orderedQty above MAX_ORDERED_QTY', async () => {
    const dto = plainToInstance(SaveNightEntriesDto, {
      clientId: 1,
      productId: 2,
      orderedQty: QUANTITY_PRECISION.MAX_ORDERED_QTY + 1,
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'orderedQty')).toBe(true);
  });

  it('accepts orderedQty exactly at MAX_ORDERED_QTY', async () => {
    const dto = plainToInstance(SaveNightEntriesDto, {
      clientId: 1,
      productId: 2,
      orderedQty: QUANTITY_PRECISION.MAX_ORDERED_QTY,
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('SaveMorningEntriesDto', () => {
  it('accepts a valid entry', async () => {
    const dto = plainToInstance(SaveMorningEntriesDto, {
      clientId: 1,
      productId: 2,
      deliveredQty: 8,
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a negative deliveredQty', async () => {
    const dto = plainToInstance(SaveMorningEntriesDto, {
      clientId: 1,
      productId: 2,
      deliveredQty: -1,
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'deliveredQty')).toBe(true);
  });

  it('rejects deliveredQty above MAX_DELIVERED_QTY', async () => {
    const dto = plainToInstance(SaveMorningEntriesDto, {
      clientId: 1,
      productId: 2,
      deliveredQty: QUANTITY_PRECISION.MAX_DELIVERED_QTY + 1,
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'deliveredQty')).toBe(true);
  });
});

describe('AddProductDto', () => {
  it('accepts a valid productId', async () => {
    const dto = plainToInstance(AddProductDto, { productId: 5 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects productId below 1', async () => {
    const dto = plainToInstance(AddProductDto, { productId: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'productId')).toBe(true);
  });
});
