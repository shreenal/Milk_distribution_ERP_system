import 'dotenv/config';
import { PrismaClient, GatepassDatePolicy, SupplyCategory, DeliverySession } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

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
    await prisma.product_tray_rule.deleteMany();
    await prisma.distributor_procurement_rule.deleteMany();
    await prisma.master_group_supply_rule.deleteMany();
    await prisma.distributor_transfer_rule.deleteMany();
    await prisma.master_client_category.deleteMany();

    await prisma.master_client.deleteMany();
    await prisma.master_group.deleteMany();

    await prisma.master_driver.deleteMany();
    await prisma.master_vehicle.deleteMany();

    await prisma.master_product_link.deleteMany();
    await prisma.master_tray_type.deleteMany();
    await prisma.master_product.deleteMany();
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
    // 12) PRODUCTS
    // ------------------------------------------------------------
    const products = await Promise.all([
        // GOVIND MILK
        prisma.master_product.create({
            data: {
                code: 'GOV-COW-500',
                brand_id: govind.id,
                product_group_id: pgMilk.id,
                product_type_id: govindCowMilk.id,
                packaging_type_id: pouch.id,
                packaging_size: '500',
                packaging_unit: 'ML',
                gst_percentage: '0',
                is_gst_inclusive: false,
                is_active: true,
            },
        }),
        prisma.master_product.create({
            data: {
                code: 'GOV-COW-1000',
                brand_id: govind.id,
                product_group_id: pgMilk.id,
                product_type_id: govindCowMilk.id,
                packaging_type_id: pouch.id,
                packaging_size: '1000',
                packaging_unit: 'ML',
                gst_percentage: '0',
                is_gst_inclusive: false,
                is_active: true,
            },
        }),
        prisma.master_product.create({
            data: {
                code: 'GOV-BUF-500',
                brand_id: govind.id,
                product_group_id: pgMilk.id,
                product_type_id: govindBuffaloMilk.id,
                packaging_type_id: pouch.id,
                packaging_size: '500',
                packaging_unit: 'ML',
                gst_percentage: '0',
                is_gst_inclusive: false,
                is_active: true,
            },
        }),

        // GOVIND CURD
        // GOVIND CURD - CUP (NO TRAY)
        prisma.master_product.create({
            data: {
                code: 'GOV-CURD-CUP-200',
                brand_id: govind.id,
                product_group_id: pgCurd.id,
                product_type_id: govindCurdRegular.id,
                packaging_type_id: cup.id,
                packaging_size: '200',
                packaging_unit: 'G',
                gst_percentage: '5',
                is_gst_inclusive: true,
                is_active: true,
            },
        }),

        // GOVIND CURD - POUCH (TRAY)
        prisma.master_product.create({
            data: {
                code: 'GOV-CURD-PCH-400',
                brand_id: govind.id,
                product_group_id: pgCurd.id,
                product_type_id: govindCurdRegular.id,
                packaging_type_id: pouch.id,
                packaging_size: '400',
                packaging_unit: 'G',
                gst_percentage: '5',
                is_gst_inclusive: true,
                is_active: true,
            },
        }),

        // GOVIND LASSI
        prisma.master_product.create({
            data: {
                code: 'GOV-LASSI-BTL-200',
                brand_id: govind.id,
                product_group_id: pgLassi.id,
                product_type_id: govindLassiSweet.id,
                packaging_type_id: bottle.id,
                packaging_size: '200',
                packaging_unit: 'ML',
                gst_percentage: '5',
                is_gst_inclusive: true,
                is_active: true,
            },
        }),

        prisma.master_product.create({
            data: {
                code: 'GOV-LASSI-PCH-200',
                brand_id: govind.id,
                product_group_id: pgLassi.id,
                product_type_id: govindLassiSweet.id,
                packaging_type_id: pouch.id,
                packaging_size: '200',
                packaging_unit: 'ML',
                gst_percentage: '5',
                is_gst_inclusive: true,
                is_active: true,
            },
        }),

        // SHAKTI MILK
        prisma.master_product.create({
            data: {
                code: 'SHA-TONED-500',
                brand_id: shakti.id,
                product_group_id: pgMilk.id,
                product_type_id: shaktiToned.id,
                packaging_type_id: pouch.id,
                packaging_size: '500',
                packaging_unit: 'ML',
                gst_percentage: '0',
                is_gst_inclusive: false,
                is_active: true,
            },
        }),
        prisma.master_product.create({
            data: {
                code: 'SHA-TONED-1000',
                brand_id: shakti.id,
                product_group_id: pgMilk.id,
                product_type_id: shaktiToned.id,
                packaging_type_id: pouch.id,
                packaging_size: '1000',
                packaging_unit: 'ML',
                gst_percentage: '0',
                is_gst_inclusive: false,
                is_active: true,
            },
        }),
        prisma.master_product.create({
            data: {
                code: 'SHA-FC-500',
                brand_id: shakti.id,
                product_group_id: pgMilk.id,
                product_type_id: shaktiFullCream.id,
                packaging_type_id: pouch.id,
                packaging_size: '500',
                packaging_unit: 'ML',
                gst_percentage: '0',
                is_gst_inclusive: false,
                is_active: true,
            },
        }),
    ]);

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
    // ------------------------------------------------------------
    // 15) VEHICLES
    // ------------------------------------------------------------
    const vehicles = await Promise.all([
        prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1001',
                vehicle_name: 'Vehicle 1',
                capacity: 500,
                is_active: true,
            },
        }),
        prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1002',
                vehicle_name: 'Vehicle 2',
                capacity: 500,
                is_active: true,
            },
        }),
        prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1003',
                vehicle_name: 'Vehicle 3',
                capacity: 600,
                is_active: true,
            },
        }),
        prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1004',
                vehicle_name: 'Vehicle 4',
                capacity: 600,
                is_active: true,
            },
        }),
        prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1005',
                vehicle_name: 'Vehicle 5',
                capacity: 700,
                is_active: true,
            },
        }),
        prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1006',
                vehicle_name: 'Vehicle 6',
                capacity: 700,
                is_active: true,
            },
        }),
        prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1007',
                vehicle_name: 'Vehicle 7',
                capacity: 700,
                is_active: true,
            },
        }),
        prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1008',
                vehicle_name: 'Vehicle 8',
                capacity: 700,
                is_active: true,
            },
        }),
        prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1009',
                vehicle_name: 'Vehicle 9',
                capacity: 700,
                is_active: true,
            },
        }),
        prisma.master_vehicle.create({
            data: {
                vehicle_number: 'MH01AA1010',
                vehicle_name: 'Vehicle 10',
                capacity: 700,
                is_active: true,
            },
        }),
    ]);

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
            {
                name: 'Driver 6',
                contact: '8000000006',
                vehicle_id: vehicles[5].id,
                is_active: true,
            },
            {
                name: 'Driver 7',
                contact: '8000000007',
                vehicle_id: vehicles[6].id,
                is_active: true,
            },
            {
                name: 'Driver 8',
                contact: '8000000008',
                vehicle_id: vehicles[7].id,
                is_active: true,
            },
            {
                name: 'Driver 9',
                contact: '8000000009',
                vehicle_id: vehicles[8].id,
                is_active: true,
            },
            {
                name: 'Driver 10',
                contact: '8000000010',
                vehicle_id: vehicles[9].id,
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
        ],
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

                    billing_group_id: group.id,
                    delivery_group_id: group.id,
                },
            });

            clients.push(client);
        }
    }


    // ------------------------------------------------------------
    // 19A) CLIENT CATEGORIES
    // ------------------------------------------------------------

    const clientCategoryRows: {
        client_id: number;
        category: SupplyCategory;
    }[] = [];

    for (const client of clients) {
        // Every client purchases Milk
        clientCategoryRows.push({
            client_id: client.id,
            category: SupplyCategory.MILK,
        });

        // Every third client also purchases Non-Milk
        if (client.id % 3 === 0) {
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
    // ------------------------------------------------------------
    const allProducts = await prisma.master_product.findMany({
        include: {
            master_product_group: true,
        },
        orderBy: { id: 'asc' },
    });

    const allDistributorRates = await prisma.distributor_product_rate.findMany({
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
        groupSupplyRulesData.map(rule => [
            `${rule.group_id}_${rule.category}`,
            rule.distributor_id,
        ]),
    );

    for (const client of clients) {
        for (const product of allProducts) {



            const distributorId = groupSupplyRuleMap.get(
                `${client.delivery_group_id}_${product.master_product_group.category}`,
            );

            if (!distributorId) {
                continue;
                // or
                // throw new Error(
                //   `Missing supply rule for group ${client.delivery_group_id} and category ${product.master_product_group.category}`,
                // );
            }

            const productLink = productLinkByDistributorProduct.get(
                `${distributorId}_${product.id}`,
            );

            if (!productLink) {
                continue;
            }

            const rate = distributorRateByProductLinkId.get(productLink.id);

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
    // ------------------------------------------------------------
    await prisma.product_tray_rule.createMany({
        data: [
            // ------------------------
            // GOVIND
            // ------------------------

            // Cow Milk
            {
                product_group_id: pgMilk.id,
                brand_id: govind.id,
                product_type_id: govindCowMilk.id,
                packaging_type_id: pouch.id,
                tray_type_id: govindBlueTray.id,
                applies_to_packaging: true,
                is_active: true,
            },

            // Buffalo Milk
            {
                product_group_id: pgMilk.id,
                brand_id: govind.id,
                product_type_id: govindBuffaloMilk.id,
                packaging_type_id: pouch.id,
                tray_type_id: govindWhiteTray.id,
                applies_to_packaging: true,
                is_active: true,
            },

            // Curd Pouch
            {
                product_group_id: pgCurd.id,
                brand_id: govind.id,
                product_type_id: govindCurdRegular.id,
                packaging_type_id: pouch.id,
                tray_type_id: govindGreenTray.id,
                applies_to_packaging: true,
                is_active: true,
            },

            // Lassi Pouch
            {
                product_group_id: pgLassi.id,
                brand_id: govind.id,
                product_type_id: govindLassiSweet.id,
                packaging_type_id: pouch.id,
                tray_type_id: govindYellowTray.id,
                applies_to_packaging: true,
                is_active: true,
            },

            // ------------------------
            // SHAKTI
            // One tray for all milk
            // ------------------------

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