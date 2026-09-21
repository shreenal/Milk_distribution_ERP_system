import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { SupplyCategory } from '../../../../generated/prisma/client.js';
import { SaveVehicleAllocationDto } from './save-vehicle-allocation.dto.js';

describe('SaveVehicleAllocationDto', () => {
    const validAllocation = {
        vehicleId: 1,
        distributorId: 10,
        category: SupplyCategory.MILK,
        productId: 100,
        allocatedQty: 25,
    };

    const validAssignment = {
        vehicleId: 1,
        milkDistributorId: 10,
        nonMilkDistributorId: 20,
    };

    const createDto = (
        overrides: Record<string, unknown> = {},
    ): SaveVehicleAllocationDto => {
        return plainToInstance(SaveVehicleAllocationDto, {
            allocations: [validAllocation],
            assignments: [validAssignment],
            ...overrides,
        });
    };

    describe('valid input', () => {
        it('should validate a complete valid DTO', async () => {
            const dto = createDto({
                expectedUpdatedAt: '2026-09-13T10:30:00.000Z',
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(0);
        });

        it('should allow expectedUpdatedAt to be omitted', async () => {
            const dto = createDto();

            const errors = await validate(dto);

            expect(errors).toHaveLength(0);
        });

        it('should allow nullable distributor IDs', async () => {
            const dto = createDto({
                assignments: [
                    {
                        vehicleId: 1,
                        milkDistributorId: null,
                        nonMilkDistributorId: null,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(0);
        });

        it('should allow zero allocated quantity', async () => {
            const dto = createDto({
                allocations: [
                    {
                        ...validAllocation,
                        allocatedQty: 0,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(0);
        });
    });

    describe('allocations', () => {
        it('should reject a non-array allocations value', async () => {
            const dto = createDto({
                allocations: {},
            });

            const errors = await validate(dto);

            expect(
                errors.some((error) => error.property === 'allocations'),
            ).toBe(true);
        });

        it('should reject a non-integer vehicleId', async () => {
            const dto = createDto({
                allocations: [
                    {
                        ...validAllocation,
                        vehicleId: 1.5,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('allocations');
        });

        it('should reject a non-integer distributorId', async () => {
            const dto = createDto({
                allocations: [
                    {
                        ...validAllocation,
                        distributorId: 10.5,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('allocations');
        });

        it('should reject an invalid category', async () => {
            const dto = createDto({
                allocations: [
                    {
                        ...validAllocation,
                        category: 'INVALID_CATEGORY',
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('allocations');
        });

        it('should reject a non-integer productId', async () => {
            const dto = createDto({
                allocations: [
                    {
                        ...validAllocation,
                        productId: 100.5,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('allocations');
        });

        it('should reject a negative allocatedQty', async () => {
            const dto = createDto({
                allocations: [
                    {
                        ...validAllocation,
                        allocatedQty: -1,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('allocations');
        });

        it('should reject an allocation without vehicleId', async () => {
            const { vehicleId: _, ...allocation } = validAllocation;

            const dto = createDto({
                allocations: [allocation],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('allocations');
        });

        it('should reject a non-number allocatedQty', async () => {
            const dto = createDto({
                allocations: [
                    {
                        ...validAllocation,
                        allocatedQty: '25',
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('allocations');
        });

        it('should validate every nested allocation', async () => {
            const dto = createDto({
                allocations: [
                    validAllocation,
                    {
                        ...validAllocation,
                        vehicleId: 'invalid',
                    },
                ],
            });

            const errors = await validate(dto);

            const allocationsError = errors.find(
                (error) => error.property === 'allocations',
            );

            expect(allocationsError).toBeDefined();
            expect(allocationsError?.children?.length).toBeGreaterThan(0);
        });
    });

    describe('assignments', () => {
        it('should reject a non-array assignments value', async () => {
            const dto = createDto({
                assignments: {},
            });

            const errors = await validate(dto);

            expect(
                errors.some((error) => error.property === 'assignments'),
            ).toBe(true);
        });

        it('should allow empty allocations and assignments', async () => {
            const dto = createDto({
                allocations: [],
                assignments: [],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(0);
        });

        it('should reject a non-integer vehicleId', async () => {
            const dto = createDto({
                assignments: [
                    {
                        ...validAssignment,
                        vehicleId: 1.5,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('assignments');
        });

        it('should reject a non-integer milkDistributorId', async () => {
            const dto = createDto({
                assignments: [
                    {
                        ...validAssignment,
                        milkDistributorId: 10.5,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('assignments');
        });

        it('should reject a non-integer nonMilkDistributorId', async () => {
            const dto = createDto({
                assignments: [
                    {
                        ...validAssignment,
                        nonMilkDistributorId: 20.5,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('assignments');
        });

        it('should allow milkDistributorId to be omitted', async () => {
            const dto = createDto({
                assignments: [
                    {
                        vehicleId: 1,
                        nonMilkDistributorId: 20,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(0);
        });

        it('should allow nonMilkDistributorId to be omitted', async () => {
            const dto = createDto({
                assignments: [
                    {
                        vehicleId: 1,
                        milkDistributorId: 10,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(0);
        });

        it('should validate every nested assignment', async () => {
            const dto = createDto({
                assignments: [
                    validAssignment,
                    {
                        ...validAssignment,
                        vehicleId: 'invalid',
                    },
                ],
            });

            const errors = await validate(dto);

            const assignmentsError = errors.find(
                (error) => error.property === 'assignments',
            );

            expect(assignmentsError).toBeDefined();
            expect(assignmentsError?.children?.length).toBeGreaterThan(0);
        });
    });

    describe('expectedUpdatedAt', () => {
        it('should accept a valid ISO-8601 timestamp', async () => {
            const dto = createDto({
                expectedUpdatedAt: '2026-09-13T10:30:00.000Z',
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(0);
        });

        it('should reject an invalid timestamp', async () => {
            const dto = createDto({
                expectedUpdatedAt: 'not-a-date',
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('expectedUpdatedAt');
        });

        it('should reject a non-string expectedUpdatedAt', async () => {
            const dto = createDto({
                expectedUpdatedAt: 123456,
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(1);
            expect(errors[0].property).toBe('expectedUpdatedAt');
        });
    });

    it('should accept both supply categories', async () => {
        for (const category of [
            SupplyCategory.MILK,
            SupplyCategory.NON_MILK,
        ]) {
            const dto = createDto({
                allocations: [
                    {
                        ...validAllocation,
                        category,
                    },
                ],
            });

            const errors = await validate(dto);

            expect(errors).toHaveLength(0);
        }
    });
});