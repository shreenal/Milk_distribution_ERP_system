import { PrismaClient, GatepassDatePolicy, SupplyCategory, DeliverySession, PricingUnit } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { config } from 'dotenv';

config({
    path: '.env.test.local',
    override: true,
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('Test database configuration is missing: DATABASE_URL was not loaded.');
}

const database = new URL(databaseUrl);

if (database.pathname !== '/milk_distribution_test') {
    throw new Error(
        `Refusing to seed database "${database.pathname.slice(1)}". ` +
        'Expected "milk_distribution_test".',
    );
}

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Seeding master data...');

    // ------------------------------------------------------------
    // 1) CLEAN UP
    // ------------------------------------------------------------
    // Delete children first, then parents.

    await prisma.client_tray_transaction.deleteMany();
    await prisma.client_collection.deleteMany();

    await prisma.order_sheet_items.deleteMany();
    await prisma.order_sheet.deleteMany();
    await prisma.dairy_tray_transaction.deleteMany();
    await prisma.dairy_tray_paper.deleteMany();
    await prisma.distributor_transfer.deleteMany();
    await prisma.order_paper.deleteMany();

    await prisma.cash_route_expense.deleteMany();
    await prisma.cash_route_settlement.deleteMany();
    await prisma.cash_direct_collection.deleteMany();
    await prisma.cash_bank_deposit.deleteMany();

    await prisma.purchase_entry.deleteMany();
    await prisma.purchase_paper.deleteMany();

    await prisma.vehicle_allocation.deleteMany();
    await prisma.vehicle_distribution_assignment.deleteMany();
    await prisma.vehicle_allocation_paper.deleteMany();

    await prisma.master_client_rate_product.deleteMany();
    await prisma.distributor_product_rate.deleteMany();
    await prisma.distributor_product_priority.deleteMany();

    await prisma.master_product_link.deleteMany();
    await prisma.master_tray_type.deleteMany();
    await prisma.master_product.deleteMany();

    await prisma.product_order_unit.deleteMany();
    await prisma.master_order_unit_type.deleteMany();

    await prisma.product_tray_rule.deleteMany();
    await prisma.distributor_procurement_rule.deleteMany();
    await prisma.master_group_supply_rule.deleteMany();
    await prisma.distributor_transfer_rule.deleteMany();
    await prisma.master_client_category.deleteMany();

    await prisma.master_client.deleteMany();
    await prisma.master_group.deleteMany();

    await prisma.master_driver.deleteMany();
    await prisma.master_vehicle.deleteMany();

    await prisma.master_product_type.deleteMany();
    await prisma.master_product_group.deleteMany();
    await prisma.master_packaging_type.deleteMany();
    await prisma.master_brand.deleteMany();
    await prisma.master_dairy.deleteMany();

    await prisma.master_bank.deleteMany();
    await prisma.master_employee.deleteMany();
    await prisma.master_expense_type.deleteMany();
    await prisma.master_distributor.deleteMany();

    await prisma.users.deleteMany();
    await prisma.roles.deleteMany();
    // ------------------------------------------------------------
    // 2) ROLES + USERS
    // ------------------------------------------------------------
    const adminRole = await prisma.roles.create({
        data: { name: 'ADMIN' },
    });

    const employeeRole = await prisma.roles.create({
        data: { name: 'EMPLOYEE' },
    });

    const hashedPassword = await bcrypt.hash('password123', 10);

    await prisma.users.createMany({
        data: [
            {
                role_id: adminRole.id,
                username: 'admin1',
                email: 'admin1@example.com',
                password: hashedPassword,
                first_name: 'Admin',
                last_name: 'One',
            },
            {
                role_id: employeeRole.id,
                username: 'employee1',
                email: 'employee1@example.com',
                password: hashedPassword,
                first_name: 'Employee',
                last_name: 'One',
            },
        ],
    });

    // ------------------------------------------------------------
    // 3) DAIRIES
    // ------------------------------------------------------------
    const dairyGovind = await prisma.master_dairy.create({
        data: {
            name: 'Govind Dairy',
            city: 'Mumbai',
            is_active: true,
        },
    });

    const dairyShakti = await prisma.master_dairy.create({
        data: {
            name: 'Shakti Dairy',
            city: 'Mumbai',
            is_active: true,
        },
    });


    // ------------------------------------------------------------
    // 4) DISTRIBUTORS
    // Scenario:
    // - Group 1-9 milk -> Distributor A
    // - Group 10 milk -> Distributor B
    // - Group 1-10 non-milk -> Distributor C
    // ------------------------------------------------------------
    const distributorA = await prisma.master_distributor.create({
        data: {
            name: 'Distributor A',
            contact: '9876543210',
            email: 'dist.a@example.com',
            is_active: true,
        },
    });

    const distributorB = await prisma.master_distributor.create({
        data: {
            name: 'Distributor B',
            contact: '9876543211',
            email: 'dist.b@example.com',
            is_active: true,
        },
    });

    const distributorC = await prisma.master_distributor.create({
        data: {
            name: 'Distributor C',
            contact: '9876543212',
            email: 'dist.c@example.com',
            is_active: true,
        },
    });

    // ------------------------------------------------------------
    // 5) BANKS
    // ------------------------------------------------------------
    await prisma.master_bank.createMany({
        data: [
            { name: 'State Bank of India', is_active: true },
            { name: 'HDFC Bank', is_active: true },
            { name: 'ICICI Bank', is_active: true },
        ],
    });

    // ------------------------------------------------------------
    // 6) EMPLOYEES
    // ------------------------------------------------------------
    await prisma.master_employee.createMany({
        data: [
            { name: 'Employee 1', contact: '9000000001', is_active: true },
            { name: 'Employee 2', contact: '9000000002', is_active: true },
            { name: 'Employee 3', contact: '9000000003', is_active: true },
        ],
    });

    // ------------------------------------------------------------
    // 7) EXPENSE TYPES
    // ------------------------------------------------------------
    await prisma.master_expense_type.createMany({
        data: [
            { name: 'Diesel', is_active: true },
            { name: 'Parking', is_active: true },
            { name: 'Driver Expense', is_active: true },
            { name: 'Loading', is_active: true },
            { name: 'Miscellaneous', is_active: true },
        ],
    });

    // ------------------------------------------------------------
    // 8) PACKAGING TYPES
    // ------------------------------------------------------------
    const pouch = await prisma.master_packaging_type.create({
        data: { name: 'Pouch' },
    });

    const bottle = await prisma.master_packaging_type.create({
        data: { name: 'Bottle' },
    });

    const packet = await prisma.master_packaging_type.create({
        data: { name: 'Packet' },
    });

    const cup = await prisma.master_packaging_type.create({
        data: { name: 'Cup' },
    });

    const trayOrderUnit = await prisma.master_order_unit_type.create({
        data: { name: 'Tray' },
    });

    const boxOrderUnit = await prisma.master_order_unit_type.create({
        data: { name: 'Box' },
    });

    // ------------------------------------------------------------
    // 9) BRANDS
    // ------------------------------------------------------------
    const govind = await prisma.master_brand.create({
        data: {
            name: 'Govind',
            dairy_id: dairyGovind.id,
            gatepass_date_policy: GatepassDatePolicy.PREVIOUS_DAY,
            is_active: true,
        },
    });

    const shakti = await prisma.master_brand.create({
        data: {
            name: 'Shakti',
            dairy_id: dairyShakti.id,
            gatepass_date_policy: GatepassDatePolicy.SAME_DAY,
            is_active: true,
        },
    });

    // ------------------------------------------------------------
    // 10) PRODUCT GROUPS
    // IMPORTANT:
    // product_group is NOT just "Milk / Non-Milk".
    // category tells whether a group belongs to MILK or NON_MILK.
    // ------------------------------------------------------------
    const pgMilk = await prisma.master_product_group.create({
        data: {
            name: 'Milk',
            category: SupplyCategory.MILK,
        },
    });

    const pgCurd = await prisma.master_product_group.create({
        data: {
            name: 'Curd',
            category: SupplyCategory.NON_MILK,
        },
    });

    const pgLassi = await prisma.master_product_group.create({
        data: {
            name: 'Lassi',
            category: SupplyCategory.NON_MILK,
        },
    });

    const pgButtermilk = await prisma.master_product_group.create({
        data: {
            name: 'Buttermilk',
            category: SupplyCategory.NON_MILK,
        },
    });

    // ------------------------------------------------------------
    // 11) PRODUCT TYPES
    // Unique per brand.
    // ------------------------------------------------------------
    // Govind
    const govindCowMilk = await prisma.master_product_type.create({
        data: {
            brand_id: govind.id,
            name: 'Cow Milk',
        },
    });

    const govindBuffaloMilk = await prisma.master_product_type.create({
        data: {
            brand_id: govind.id,
            name: 'Buffalo Milk',
        },
    });

    const govindCurdRegular = await prisma.master_product_type.create({
        data: {
            brand_id: govind.id,
            name: 'Regular Curd',
        },
    });

    const govindLassiSweet = await prisma.master_product_type.create({
        data: {
            brand_id: govind.id,
            name: 'Sweet Lassi',
        },
    });

    // Shakti
    const shaktiToned = await prisma.master_product_type.create({
        data: {
            brand_id: shakti.id,
            name: 'Toned Milk',
        },
    });

    const shaktiFullCream = await prisma.master_product_type.create({
        data: {
            brand_id: shakti.id,
            name: 'Full Cream Milk',
        },
    });

    // ------------------------------------------------------------
    // 12) PRODUCT ORDER UNIT CONFIGURATIONS
    // Reusable commercial/order-unit configurations.
    // ------------------------------------------------------------

    const productOrderUnits = await prisma.product_order_unit.createManyAndReturn({
        data: [
            {
                order_unit_type_id: trayOrderUnit.id,
                units_per_order_unit: 20,
                pricing_quantity: 10,
                pricing_unit: PricingUnit.L,
            },
            {
                order_unit_type_id: trayOrderUnit.id,
                units_per_order_unit: 10,
                pricing_quantity: 10,
                pricing_unit: PricingUnit.L,
            },
            {
                order_unit_type_id: trayOrderUnit.id,
                units_per_order_unit: 10,
                pricing_quantity: 5,
                pricing_unit: PricingUnit.L,
            },
            {
                order_unit_type_id: boxOrderUnit.id,
                units_per_order_unit: 24,
                pricing_quantity: 4.8,
                pricing_unit: PricingUnit.KG,
            },
            {
                order_unit_type_id: boxOrderUnit.id,
                units_per_order_unit: 24,
                pricing_quantity: 9.6,
                pricing_unit: PricingUnit.KG,
            },
            {
                order_unit_type_id: boxOrderUnit.id,
                units_per_order_unit: 24,
                pricing_quantity: 4.8,
                pricing_unit: PricingUnit.L,
            },
        ],
    });

    const productOrderUnitByKey = new Map(
        productOrderUnits.map((config) => [
            `${config.order_unit_type_id}_${config.units_per_order_unit}_${config.pricing_quantity}_${config.pricing_unit}`,
            config,
        ]),
    );
    const products = [
        await prisma.master_product.create({
            data: {
                code: 'GOV-COW-500',
                brand_id: govind.id,
                product_group_id: pgMilk.id,
                product_type_id: govindCowMilk.id,
                packaging_type_id: pouch.id,
                packaging_size: '500',
                packaging_unit: 'ML',
                product_order_unit_id: productOrderUnitByKey.get(
                    `${trayOrderUnit.id}_20_10_L`,
                )!.id,
                gst_percentage: '0',
                is_gst_inclusive: false,
                show_by_default: true,
                is_active: true,
            },
        }),
        await prisma.master_product.create({
            data: {
                code: 'GOV-COW-1000',
                brand_id: govind.id,
                product_group_id: pgMilk.id,
                product_type_id: govindCowMilk.id,
                packaging_type_id: pouch.id,
                packaging_size: '1000',
                packaging_unit: 'ML',
                product_order_unit_id: productOrderUnitByKey.get(
                    `${trayOrderUnit.id}_10_10_L`,
                )!.id,
                gst_percentage: '0',
                is_gst_inclusive: false,
                is_active: true,
            },
        }),
        await prisma.master_product.create({
            data: {
                code: 'GOV-BUF-500',
                brand_id: govind.id,
                product_group_id: pgMilk.id,
                product_type_id: govindBuffaloMilk.id,
                packaging_type_id: pouch.id,
                packaging_size: '500',
                packaging_unit: 'ML',
                product_order_unit_id: productOrderUnitByKey.get(
                    `${trayOrderUnit.id}_20_10_L`,
                )!.id,
                gst_percentage: '0',
                is_gst_inclusive: false,
                is_active: true,
            },
        }),
        await prisma.master_product.create({
            data: {
                code: 'GOV-CURD-CUP-200',
                brand_id: govind.id,
                product_group_id: pgCurd.id,
                product_type_id: govindCurdRegular.id,
                packaging_type_id: cup.id,
                packaging_size: '200',
                packaging_unit: 'G',
                product_order_unit_id: productOrderUnitByKey.get(
                    `${boxOrderUnit.id}_24_4.8_KG`,
                )!.id,
                gst_percentage: '5',
                is_gst_inclusive: true,
                is_active: true,
            },
        }),
        await prisma.master_product.create({
            data: {
                code: 'GOV-CURD-PCH-400',
                brand_id: govind.id,
                product_group_id: pgCurd.id,
                product_type_id: govindCurdRegular.id,
                packaging_type_id: pouch.id,
                packaging_size: '400',
                packaging_unit: 'G',
                product_order_unit_id: productOrderUnitByKey.get(
                    `${boxOrderUnit.id}_24_9.6_KG`,
                )!.id,
                gst_percentage: '5',
                is_gst_inclusive: true,
                is_active: true,
            },
        }),
        await prisma.master_product.create({
            data: {
                code: 'SHA-FC-500',
                brand_id: shakti.id,
                product_group_id: pgMilk.id,
                product_type_id: shaktiFullCream.id,
                packaging_type_id: pouch.id,
                packaging_size: '500',
                packaging_unit: 'ML',
                product_order_unit_id: productOrderUnitByKey.get(
                    `${trayOrderUnit.id}_20_10_L`,
                )!.id,
                gst_percentage: '0',
                is_gst_inclusive: false,
                is_active: true,
            },
        }),
        await prisma.master_product.create({
            data: {
                code: 'GOV-LASSI-PCH-200',
                brand_id: govind.id,
                product_group_id: pgLassi.id,
                product_type_id: govindLassiSweet.id,
                packaging_type_id: pouch.id,
                packaging_size: '200',
                packaging_unit: 'ML',
                product_order_unit_id: productOrderUnitByKey.get(
                    `${boxOrderUnit.id}_24_4.8_L`,
                )!.id,

                gst_percentage: '5',
                is_gst_inclusive: true,
                is_active: true,
            },
        }),
        await prisma.master_product.create({
            data: {
                code: 'SHA-TONED-1000',
                brand_id: shakti.id,
                product_group_id: pgMilk.id,
                product_type_id: shaktiToned.id,
                packaging_type_id: pouch.id,
                packaging_size: '1000',
                packaging_unit: 'ML',
                product_order_unit_id: productOrderUnitByKey.get(
                    `${trayOrderUnit.id}_10_10_L`,
                )!.id,
                gst_percentage: '0',
                is_gst_inclusive: false,
                show_by_default: true,
                is_active: true,
            },
        }),
        await prisma.master_product.create({
            data: {
                code: 'SHA-TONED-500',
                brand_id: shakti.id,
                product_group_id: pgMilk.id,
                product_type_id: shaktiToned.id,
                packaging_type_id: pouch.id,
                packaging_size: '500',
                packaging_unit: 'ML',
                product_order_unit_id: productOrderUnitByKey.get(
                    `${trayOrderUnit.id}_20_10_L`,
                )!.id,
                gst_percentage: '0',
                is_gst_inclusive: false,
                is_active: true,
            },
        }),
        await prisma.master_product.create({
            data: {
                code: 'GOV-LASSI-BTL-200',
                brand_id: govind.id,
                product_group_id: pgLassi.id,
                product_type_id: govindLassiSweet.id,
                packaging_type_id: bottle.id,
                packaging_size: '200',
                packaging_unit: 'ML',
                product_order_unit_id: productOrderUnitByKey.get(
                    `${boxOrderUnit.id}_24_4.8_L`,
                )!.id,
                gst_percentage: '5',
                is_gst_inclusive: true,
                is_active: true,
            },
        }),
    ];

    const productByCode = new Map(products.map((p) => [p.code, p]));

    // ------------------------------------------------------------
    // 12A) PRODUCT LINKS
    // Schema now uses master_product_link as distributor-product ownership.
    // Create one link for every valid distributor-product sourcing combination.
    // ------------------------------------------------------------
    const productLinks = await prisma.master_product_link.createManyAndReturn({
        data: [
            // Distributor A -> Govind milk
            {
                distributor_id: distributorA.id,
                product_id: productByCode.get('GOV-COW-500')!.id,
                is_active: true,
            },
            {
                distributor_id: distributorA.id,
                product_id: productByCode.get('GOV-COW-1000')!.id,
                is_active: true,
            },
            {
                distributor_id: distributorA.id,
                product_id: productByCode.get('GOV-BUF-500')!.id,
                is_active: true,
            },

            // Distributor A -> Shakti milk
            {
                distributor_id: distributorA.id,
                product_id: productByCode.get('SHA-TONED-500')!.id,
                is_active: true,
            },
            {
                distributor_id: distributorA.id,
                product_id: productByCode.get('SHA-TONED-1000')!.id,
                is_active: true,
            },
            {
                distributor_id: distributorA.id,
                product_id: productByCode.get('SHA-FC-500')!.id,
                is_active: true,
            },

            // Distributor B -> Govind Milk
            {
                distributor_id: distributorB.id,
                product_id: productByCode.get('GOV-COW-500')!.id,
                is_active: true,
            },
            {
                distributor_id: distributorB.id,
                product_id: productByCode.get('GOV-COW-1000')!.id,
                is_active: true,
            },
            {
                distributor_id: distributorB.id,
                product_id: productByCode.get('GOV-BUF-500')!.id,
                is_active: true,
            },

            // Distributor C -> non-milk
            {
                distributor_id: distributorC.id,
                product_id: productByCode.get('GOV-CURD-CUP-200')!.id,
                is_active: true,
            },
            {
                distributor_id: distributorC.id,
                product_id: productByCode.get('GOV-CURD-PCH-400')!.id,
                is_active: true,
            },
            {
                distributor_id: distributorC.id,
                product_id: productByCode.get('GOV-LASSI-BTL-200')!.id,
                is_active: true,
            },
            {
                distributor_id: distributorC.id,
                product_id: productByCode.get('GOV-LASSI-PCH-200')!.id,
                is_active: true,
            },

            // D4: distributor A as a second, lower-priority eligible NON_MILK distributor for
            // Govind Curd — makes the fallback-resolution code path testable for NON_MILK the
            // same way it already is for MILK (see distributor_product_priority below). No
            // Buttermilk link is created for either distributor — that omission is intentional
            // (D3).
            {
                distributor_id: distributorA.id,
                product_id: productByCode.get('GOV-CURD-CUP-200')!.id,
                is_active: true,
            },
        ],
    });

    const productLinkByDistributorProduct = new Map(
        productLinks.map((link) => [`${link.distributor_id}_${link.product_id}`, link]),
    );

    // ------------------------------------------------------------
    // 13) PROCUREMENT RULES
    // ------------------------------------------------------------
    await prisma.distributor_procurement_rule.createMany({
        data: [
            // Distributor A handles milk for Govind and shakti
            {
                distributor_id: distributorA.id,
                category: SupplyCategory.MILK,
                brand_id: govind.id,
                product_group_id: pgMilk.id,
                is_active: true,
            },
            {
                distributor_id: distributorA.id,
                category: SupplyCategory.MILK,
                brand_id: shakti.id,
                product_group_id: pgMilk.id,
                is_active: true,
            },

            // Distributor B handles milk for Govind
            {
                distributor_id: distributorB.id,
                category: SupplyCategory.MILK,
                brand_id: govind.id,
                product_group_id: pgMilk.id,
                is_active: true,
            },

            // Distributor C handles all non-milk
            {
                distributor_id: distributorC.id,
                category: SupplyCategory.NON_MILK,
                brand_id: govind.id,
                product_group_id: pgCurd.id,
                is_active: true,
            },
            {
                distributor_id: distributorC.id,
                category: SupplyCategory.NON_MILK,
                brand_id: govind.id,
                product_group_id: pgLassi.id,
                is_active: true,
            },

            // D4: distributor A is also eligible to procure Govind Curd (NON_MILK), as a
            // lower-priority alternate to C — see distributor_product_priority below. This is
            // the NON_MILK equivalent of A/B's alternate-milk-distributor setup further down.
            // No alternate distributor is configured for Lassi or Buttermilk — only one
            // fallback scenario per category is needed to exercise the code path.
            {
                distributor_id: distributorA.id,
                category: SupplyCategory.NON_MILK,
                brand_id: govind.id,
                product_group_id: pgCurd.id,
                is_active: true,
            },
        ],
    });

    // ------------------------------------------------------------
    // 14) DISTRIBUTOR PRODUCT RATES
    // distributor_product_rate now points to master_product_link
    // ------------------------------------------------------------
    const rateDate = new Date('2026-01-01');

    const distributorProductRates = [
        // Distributor A - Govind milk and shakti milk
        {
            distributor_id: distributorA.id,
            product_code: 'GOV-COW-500',
            purchase_rate: '24.00',
            selling_rate: '27.00',
        },
        {
            distributor_id: distributorA.id,
            product_code: 'GOV-COW-1000',
            purchase_rate: '47.00',
            selling_rate: '52.00',
        },
        {
            distributor_id: distributorA.id,
            product_code: 'GOV-BUF-500',
            purchase_rate: '30.00',
            selling_rate: '34.00',
        },

        // Distributor A - Shakti milk
        {
            distributor_id: distributorA.id,
            product_code: 'SHA-TONED-500',
            purchase_rate: '23.50',
            selling_rate: '26.50',
        },
        {
            distributor_id: distributorA.id,
            product_code: 'SHA-TONED-1000',
            purchase_rate: '46.00',
            selling_rate: '51.00',
        },
        {
            distributor_id: distributorA.id,
            product_code: 'SHA-FC-500',
            purchase_rate: '29.50',
            selling_rate: '33.50',
        },

        // Distributor B - Govind milk
        {
            distributor_id: distributorB.id,
            product_code: 'GOV-COW-500',
            purchase_rate: '24.00',
            selling_rate: '28.20',
        },
        {
            distributor_id: distributorB.id,
            product_code: 'GOV-COW-1000',
            purchase_rate: '47.00',
            selling_rate: '52.00',
        },
        {
            distributor_id: distributorB.id,
            product_code: 'GOV-BUF-500',
            purchase_rate: '30.00',
            selling_rate: '34.00',
        },


        // Distributor C - Non Milk

        {
            distributor_id: distributorC.id,
            product_code: 'GOV-CURD-CUP-200',
            purchase_rate: '18.00',
            selling_rate: '22.00',
        },
        {
            distributor_id: distributorC.id,
            product_code: 'GOV-CURD-PCH-400',
            purchase_rate: '34.00',
            selling_rate: '40.00',
        },

        {
            distributor_id: distributorC.id,
            product_code: 'GOV-LASSI-BTL-200',
            purchase_rate: '12.00',
            selling_rate: '15.00',
        },
        {
            distributor_id: distributorC.id,
            product_code: 'GOV-LASSI-PCH-200',
            purchase_rate: '12.50',
            selling_rate: '15.50',
        },
        // D4 — distributor A's fallback rate for Govind Curd, deliberately different from
        // distributor C's rate for the same product so a fallback-resolved purchase is
        // distinguishable in tests from the primary-distributor price.
        {
            distributor_id: distributorA.id,
            product_code: 'GOV-CURD-CUP-200',
            purchase_rate: '19.00',
            selling_rate: '23.00',
        },
    ];

    await prisma.distributor_product_rate.createMany({
        data: distributorProductRates.map((row) => {
            const product = productByCode.get(row.product_code);
            if (!product) {
                throw new Error(`Product not found for rate seed: ${row.product_code}`);
            }

            const productLink = productLinkByDistributorProduct.get(
                `${row.distributor_id}_${product.id}`,
            );

            if (!productLink) {
                throw new Error(
                    `Product link not found for distributor ${row.distributor_id} and product ${row.product_code}`,
                );
            }

            return {
                product_link_id: productLink.id,
                purchase_rate: row.purchase_rate,
                selling_rate: row.selling_rate,
                effective_from: rateDate,
                effective_to: null,
                is_active: true,
            };
        }),
    });

    // D2: a superseded, expired rate for the same (distributorA, GOV-COW-500) link, predating
    // the current row above. Exercises OrdersRepository.getSellingRate /
    // PurchaseRepository.findProductLinkRateForDate(Batch)'s "most recent applicable rate"
    // selection (ORDER BY effective_from desc / explicit date-range filtering) with a genuine
    // second candidate row, and confirms an expired rate is correctly excluded once its
    // effective_to has passed.
    {
        const govCow500LinkA = productLinkByDistributorProduct.get(
            `${distributorA.id}_${productByCode.get('GOV-COW-500')!.id}`,
        );
        if (!govCow500LinkA) {
            throw new Error('Expected product link for distributor A / GOV-COW-500');
        }
        await prisma.distributor_product_rate.create({
            data: {
                product_link_id: govCow500LinkA.id,
                purchase_rate: '22.00',
                selling_rate: '25.00',
                effective_from: new Date('2025-06-01'),
                effective_to: new Date('2025-12-31'),
                is_active: true,
            },
        });
    }

    // ------------------------------------------------------------
    // 15) VEHICLES
    // ------------------------------------------------------------
    // Deliberately fewer vehicles (5) than groups (10): vehicle_distribution_assignment /
    // vehicle_allocation are keyed by vehicle_id + distributor_id, independent of
    // master_group.vehicle_id, so real allocation tests must consolidate more than one
    // group's demand onto the same vehicle — a 1:1 vehicle:group baseline hid that entirely.
    const vehicles = [
        await prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1001',
                vehicle_name: 'Vehicle 1',
                capacity: 500,
                is_active: true,
            },
        }),
        await prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1002',
                vehicle_name: 'Vehicle 2',
                capacity: 500,
                is_active: true,
            },
        }),
        await prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1003',
                vehicle_name: 'Vehicle 3',
                capacity: 600,
                is_active: true,
            },
        }),
        await prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1004',
                vehicle_name: 'Vehicle 4',
                capacity: 600,
                is_active: true,
            },
        }),
        await prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1005',
                vehicle_name: 'Vehicle 5',
                capacity: 700,
                is_active: true,
            },
        }),
    ];

    // ------------------------------------------------------------
    // 16) DRIVERS
    // ------------------------------------------------------------
    await prisma.master_driver.createMany({
        data: [
            {
                name: 'Driver 1',
                contact: '8000000001',
                vehicle_id: vehicles[0].id,
                is_active: true,
            },
            {
                name: 'Driver 2',
                contact: '8000000002',
                vehicle_id: vehicles[1].id,
                is_active: true,
            },
            {
                name: 'Driver 3',
                contact: '8000000003',
                vehicle_id: vehicles[2].id,
                is_active: true,
            },
            {
                name: 'Driver 4',
                contact: '8000000004',
                vehicle_id: vehicles[3].id,
                is_active: true,
            },
            {
                name: 'Driver 5',
                contact: '8000000005',
                vehicle_id: vehicles[4].id,
                is_active: true,
            },
        ],
    });

    // ------------------------------------------------------------
    // 17) GROUPS
    // 10 groups.
    // Note:
    // master_group still has distributor_id in schema.
    // But category-specific sourcing is driven by master_group_supply_rule.
    // ------------------------------------------------------------
    const groups: Array<{
        id: number;
        name: string;
        vehicle_id: number | null;
        delivery_session: DeliverySession;
    }> = [];

    for (let i = 1; i <= 10; i++) {
        const deliverySession =
            i <= 9
                ? DeliverySession.NIGHT
                : DeliverySession.MORNING;

        const group = await prisma.master_group.create({
            data: {
                name: `Group ${i}`,
                vehicle_id: vehicles[(i - 1) % vehicles.length].id,
                delivery_session: deliverySession,
                is_active: true,
            },
        });

        groups.push({
            id: group.id,
            name: group.name,
            vehicle_id: group.vehicle_id,
            delivery_session: group.delivery_session,
        });
    }


    // ------------------------------------------------------------
    // 18) GROUP SUPPLY RULES
    // Scenario:
    // - Groups 1-9 milk -> Distributor A
    // - Group 10 milk -> Distributor B
    // - Groups 1-10 non-milk -> Distributor C
    // ------------------------------------------------------------
    const groupSupplyRulesData: Array<{
        group_id: number;
        category: SupplyCategory;
        distributor_id: number;
        is_active: boolean;
    }> = [];

    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const milkDistributorId = i < 9 ? distributorA.id : distributorB.id;

        groupSupplyRulesData.push({
            group_id: group.id,
            category: SupplyCategory.MILK,
            distributor_id: milkDistributorId,
            is_active: true,
        });

        groupSupplyRulesData.push({
            group_id: group.id,
            category: SupplyCategory.NON_MILK,
            distributor_id: distributorC.id,
            is_active: true,
        });
    }

    await prisma.master_group_supply_rule.createMany({
        data: groupSupplyRulesData,
    });


    // DECISION (B3/D5): distributorB is intentionally receive-only — it never supplies stock
    // that another distributor owns, so no B -> A or B -> C transfer rule exists. This is a
    // confirmed business rule, not a gap: a test that forces distributorB into a mismatched
    // "supplier" role (e.g. by deactivating distributorA's product link for a Group 1-9 milk
    // product, forcing fallback onto B for a client owned by A or C) is exercising a genuine
    // negative path and should assert that DistributorTransferValidationService.validateTransferRules
    // rejects it, not treat the missing rule as something to add.
    await prisma.distributor_transfer_rule.createMany({
        data: [
            {
                supplier_distributor_id: distributorA.id,
                owner_distributor_id: distributorB.id,
                is_active: true,
            },
            {
                supplier_distributor_id: distributorA.id,
                owner_distributor_id: distributorC.id,
                is_active: true,
            },
            {
                supplier_distributor_id: distributorC.id,
                owner_distributor_id: distributorA.id,
                is_active: true,
            },
            {
                supplier_distributor_id: distributorC.id,
                owner_distributor_id: distributorB.id,
                is_active: true,
            },
        ],
    });


    // ------------------------------------------------------------
    // 13A) DISTRIBUTOR PRODUCT PRIORITIES
    // ------------------------------------------------------------
    //
    // Priority is an alternate preference, not procurement eligibility.
    //
    // A distributor can receive a priority row ONLY when:
    // 1. It has a matching distributor_procurement_rule.
    // 2. It has a master_product_link for that product.
    //
    // Current procurement setup:
    //
    // Govind MILK:
    //   Distributor A -> eligible
    //   Distributor B -> eligible
    //
    // Shakti MILK:
    //   Distributor A -> eligible
    //   Distributor B -> NOT eligible
    //
    // NON-MILK:
    //   Distributor C -> eligible
    //   Distributor A/B -> NOT eligible
    //
    // Group defaults:
    //
    // Groups 1-9:
    //   MILK -> Distributor A
    //
    // Group 10:
    //   MILK -> Distributor B
    //
    // Therefore:
    //
    // Groups 1-9:
    //   Govind MILK -> Distributor B is priority 1 alternate
    //
    // Group 10:
    //   Govind MILK -> Distributor A is priority 1 alternate
    //
    // Shakti has NO alternate distributor.
    // Non-milk has NO alternate distributor.
    // ------------------------------------------------------------

    const distributorProductPriorityData = [
        // --------------------------------------------------------
        // GROUPS 1-9
        // Default MILK distributor = A
        // Alternate MILK distributor = B
        //
        // B is eligible for all Govind MILK products.
        // --------------------------------------------------------

        ...groups.slice(0, 9).flatMap((group) => [
            {
                group_id: group.id,
                product_id: productByCode.get('GOV-COW-500')!.id,
                distributor_id: distributorB.id,
                priority: 1,
                is_active: true,
            },
            {
                group_id: group.id,
                product_id: productByCode.get('GOV-COW-1000')!.id,
                distributor_id: distributorB.id,
                priority: 1,
                is_active: true,
            },
            {
                group_id: group.id,
                product_id: productByCode.get('GOV-BUF-500')!.id,
                distributor_id: distributorB.id,
                priority: 1,
                is_active: true,
            },
        ]),

        // --------------------------------------------------------
        // GROUP 10
        // Default MILK distributor = B
        // Alternate MILK distributor = A
        //
        // A is eligible for all Govind MILK products.
        // --------------------------------------------------------

        {
            group_id: groups[9].id,
            product_id: productByCode.get('GOV-COW-500')!.id,
            distributor_id: distributorA.id,
            priority: 1,
            is_active: true,
        },
        {
            group_id: groups[9].id,
            product_id: productByCode.get('GOV-COW-1000')!.id,
            distributor_id: distributorA.id,
            priority: 1,
            is_active: true,
        },
        {
            group_id: groups[9].id,
            product_id: productByCode.get('GOV-BUF-500')!.id,
            distributor_id: distributorA.id,
            priority: 1,
            is_active: true,
        },
        {
            group_id: groups[9].id,
            product_id: productByCode.get('SHA-TONED-1000')!.id,
            distributor_id: distributorA.id,
            priority: 1,
            is_active: true,
        },
        {
            group_id: groups[9].id,
            product_id: productByCode.get('SHA-TONED-500')!.id,
            distributor_id: distributorA.id,
            priority: 1,
            is_active: true,
        },
        {
            group_id: groups[9].id,
            product_id: productByCode.get('SHA-FC-500')!.id,
            distributor_id: distributorA.id,
            priority: 1,
            is_active: true,
        },

        // D4: Group 1's NON_MILK primary distributor for Govind Curd is C (via
        // master_group_supply_rule); distributor A is eligible as the priority-1 alternate
        // (see the matching distributor_procurement_rule and master_product_link above) so a
        // test can deactivate C's link and force resolution onto A, the same way the MILK
        // fallback cases above work.
        {
            group_id: groups[0].id,
            product_id: productByCode.get('GOV-CURD-CUP-200')!.id,
            distributor_id: distributorA.id,
            priority: 1,
            is_active: true,
        },
    ];

    await prisma.distributor_product_priority.createMany({
        data: distributorProductPriorityData,
    });

    // ------------------------------------------------------------
    // 19) CLIENTS
    // 3 clients per group = 30 clients total
    //
    // distributor_id:
    // primary/default distributor for client.
    // supply_distributor_id:
    // optional extra relation in your schema.
    //
    // For this dummy seed:
    // - primary distributor = milk owner for that group
    // - supply distributor = non-milk distributor C
    // ------------------------------------------------------------
    const clients: Array<{
        id: number;
        delivery_group_id: number;
    }> = [];


    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        const group = groups[groupIndex];

        for (let c = 1; c <= 3; c++) {

            let ownerDistributorId =
                groupIndex < 9
                    ? distributorA.id
                    : distributorB.id;

            const serial = groupIndex * 3 + c;

            // Group 2, Client 3 belongs to B but supplied by A
            if (groupIndex === 1 && c === 3) {
                ownerDistributorId = distributorB.id;
            }

            const client = await prisma.master_client.create({
                data: {
                    code: `C${String(serial).padStart(3, '0')}`,
                    name: `Client ${serial}`,
                    contact: `700000${String(serial).padStart(4, '0')}`,
                    shop_name: `Shop ${serial}`,
                    is_active: true,

                    owner_distributor_id: ownerDistributorId,

                    delivery_group_id: group.id,
                },
            });

            clients.push(client);
        }
    }


    // ------------------------------------------------------------
    // 19A) CLIENT CATEGORIES
    // ------------------------------------------------------------
    //
    // Deterministic scenario:
    // - Every client purchases MILK.
    // - Every 3rd seeded client also purchases NON_MILK.
    //
    // Use the seed serial, never client.id.
    // ------------------------------------------------------------

    const clientCategoryRows: {
        client_id: number;
        category: SupplyCategory;
    }[] = [];

    for (let index = 0; index < clients.length; index++) {
        const client = clients[index];
        const clientSerial = index + 1;

        // Every client purchases Milk.
        clientCategoryRows.push({
            client_id: client.id,
            category: SupplyCategory.MILK,
        });

        // Every third seeded client also purchases Non-Milk.
        if (clientSerial % 3 === 0) {
            clientCategoryRows.push({
                client_id: client.id,
                category: SupplyCategory.NON_MILK,
            });
        }
    }

    await prisma.master_client_category.createMany({
        data: clientCategoryRows,
    });
    // ------------------------------------------------------------
    // 20) CLIENT SELLING RATES
    // master_client_rate_product now points to master_product_link
    // Only create rates for categories the client is allowed to buy.
    //
    // DECISION (B1): this loop resolves each client's distributor via the group's *primary*
    // master_group_supply_rule only — it deliberately does NOT replicate
    // OrderCommercialService's priority/eligibility fallback algorithm. Where the primary
    // distributor has no product_link for a given product (e.g. Group 10's milk distributor,
    // distributorB, has no link to any Shakti product), no master_client_rate_product row is
    // created for that pair, and getSellingRate correctly falls through to the
    // distributor_product_rate for whichever distributor OrderCommercialService actually
    // resolves at order time. Duplicating the resolution algorithm here would risk the seed's
    // notion of "the right distributor" silently drifting out of sync with the real service —
    // two independent implementations of the same business rule is a bug magnet, not a safety
    // net. Relying on the fallback is simpler and, as a side effect, gives every such
    // combination free baseline coverage of the fallback-rate lookup path itself.
    // ------------------------------------------------------------

    const allProducts = await prisma.master_product.findMany({
        include: {
            master_product_group: true,
        },
        orderBy: { id: 'asc' },
    });

    const allDistributorRates =
        await prisma.distributor_product_rate.findMany({
            where: { is_active: true },
        });

    const distributorRateByProductLinkId = new Map(
        allDistributorRates.map((rate) => [rate.product_link_id, rate]),
    );

    const clientRateRows: Array<{
        client_id: number;
        product_link_id: number;
        selling_rate: any;
        effective_from: Date;
        effective_to: Date | null;
        is_active: boolean;
    }> = [];

    const groupSupplyRuleMap = new Map(
        groupSupplyRulesData.map((rule) => [
            `${rule.group_id}_${rule.category}`,
            rule.distributor_id,
        ]),
    );

    // Build client -> allowed categories
    const clientCategories = new Map<number, Set<SupplyCategory>>();

    for (const row of clientCategoryRows) {
        let categories = clientCategories.get(row.client_id);

        if (!categories) {
            categories = new Set<SupplyCategory>();
            clientCategories.set(row.client_id, categories);
        }

        categories.add(row.category);
    }

    for (const client of clients) {
        const allowedCategories =
            clientCategories.get(client.id) ?? new Set<SupplyCategory>();

        for (const product of allProducts) {
            const category =
                product.master_product_group.category;

            // Client is not allowed to purchase this category.
            if (!allowedCategories.has(category)) {
                continue;
            }

            const distributorId = groupSupplyRuleMap.get(
                `${client.delivery_group_id}_${category}`,
            );

            if (!distributorId) {
                continue;
            }

            const productLink =
                productLinkByDistributorProduct.get(
                    `${distributorId}_${product.id}`,
                );

            if (!productLink) {
                continue;
            }

            const rate =
                distributorRateByProductLinkId.get(productLink.id);

            if (!rate) {
                continue;
            }

            clientRateRows.push({
                client_id: client.id,
                product_link_id: productLink.id,
                selling_rate: rate.selling_rate,
                effective_from: rateDate,
                effective_to: null,
                is_active: true,
            });
        }
    }

    if (clientRateRows.length > 0) {
        await prisma.master_client_rate_product.createMany({
            data: clientRateRows,
        });
    }

    // D2: a superseded, expired client-specific rate for client C001 (clients[0], Group 1) on
    // GOV-COW-500, predating the current row the loop above just created for the same pair.
    // Exercises the client-rate side of "most recent applicable rate" selection independently
    // of the distributor-rate supersession added earlier in this file.
    {
        const client001 = clients[0];
        const govCow500LinkA = productLinkByDistributorProduct.get(
            `${distributorA.id}_${productByCode.get('GOV-COW-500')!.id}`,
        );
        if (!govCow500LinkA) {
            throw new Error('Expected product link for distributor A / GOV-COW-500');
        }
        await prisma.master_client_rate_product.create({
            data: {
                client_id: client001.id,
                product_link_id: govCow500LinkA.id,
                selling_rate: '25.00',
                effective_from: new Date('2025-06-01'),
                effective_to: new Date('2025-12-31'),
                is_active: true,
            },
        });
    }

    // ------------------------------------------------------------
    // 21) TRAY TYPES
    // ------------------------------------------------------------
    const govindBlueTray = await prisma.master_tray_type.create({
        data: {
            brand_id: govind.id,
            color: 'Blue',
            description: 'Govind Cow Milk Tray',
            is_active: true,
        },
    });

    const govindWhiteTray = await prisma.master_tray_type.create({
        data: {
            brand_id: govind.id,
            color: 'White',
            description: 'Govind Buffalo Milk Tray',
            is_active: true,
        },
    });

    const govindGreenTray = await prisma.master_tray_type.create({
        data: {
            brand_id: govind.id,
            color: 'Green',
            description: 'Govind Curd Tray',
            is_active: true,
        },
    });

    const govindYellowTray = await prisma.master_tray_type.create({
        data: {
            brand_id: govind.id,
            color: 'Yellow',
            description: 'Govind Lassi Tray',
            is_active: true,
        },
    });

    const shaktiRedTray = await prisma.master_tray_type.create({
        data: {
            brand_id: shakti.id,
            color: 'Red',
            description: 'Shakti Milk Tray',
            is_active: true,
        },
    });

    // ------------------------------------------------------------
    // 22) PRODUCT TRAY RULES
    //
    // DECISION (C6): only pouch-packaged Curd and Lassi have a tray rule. GOV-CURD-CUP-200
    // (Cup) and GOV-LASSI-BTL-200 (Bottle) are intentionally left without one — cup/bottle
    // retail packaging does not move through the crate/tray system, so
    // TrayCalculationService.resolveFrozenTrayTypeId correctly resolves null and the item is
    // skipped in all tray calculations. This is confirmed business behavior, not a missing
    // rule, and should not be "completed" by adding cup/bottle tray rules.
    // ------------------------------------------------------------
    await prisma.product_tray_rule.createMany({
        data: [
            // ------------------------
            // GOVIND
            // ------------------------

            {
                product_group_id: pgMilk.id,
                brand_id: govind.id,
                product_type_id: govindCowMilk.id,
                packaging_type_id: pouch.id,
                tray_type_id: govindBlueTray.id,
                applies_to_packaging: true,
                is_active: true,
            },

            {
                product_group_id: pgMilk.id,
                brand_id: govind.id,
                product_type_id: govindBuffaloMilk.id,
                packaging_type_id: pouch.id,
                tray_type_id: govindWhiteTray.id,
                applies_to_packaging: true,
                is_active: true,
            },

            {
                product_group_id: pgCurd.id,
                brand_id: govind.id,
                product_type_id: govindCurdRegular.id,
                packaging_type_id: pouch.id,
                tray_type_id: govindGreenTray.id,
                applies_to_packaging: true,
                is_active: true,
            },

            {
                product_group_id: pgLassi.id,
                brand_id: govind.id,
                product_type_id: govindLassiSweet.id,
                packaging_type_id: pouch.id,
                tray_type_id: govindYellowTray.id,
                applies_to_packaging: true,
                is_active: true,
            },

            {
                product_group_id: pgMilk.id,
                brand_id: shakti.id,
                product_type_id: shaktiToned.id,
                packaging_type_id: pouch.id,
                tray_type_id: shaktiRedTray.id,
                applies_to_packaging: true,
                is_active: true,
            },

            {
                product_group_id: pgMilk.id,
                brand_id: shakti.id,
                product_type_id: shaktiFullCream.id,
                packaging_type_id: pouch.id,
                tray_type_id: shaktiRedTray.id,
                applies_to_packaging: true,
                is_active: true,
            },
        ],
    });

    console.log('Master data seed completed successfully.');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error('Seed failed:', e);
        await prisma.$disconnect();
        process.exit(1);
    });