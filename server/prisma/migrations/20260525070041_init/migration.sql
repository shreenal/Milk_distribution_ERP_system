-- CreateEnum
CREATE TYPE "OrderPaperStatus" AS ENUM ('DRAFT', 'NIGHT_SUBMITTED', 'MORNING_SUBMITTED', 'FINALIZED', 'REOPENED');

-- CreateTable
CREATE TABLE "client_collection" (
    "id" SERIAL NOT NULL,
    "order_sheet_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "cash_collection" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "office_amount_given" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cheque_collection" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "online_collection" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bank_deposit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_payment" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_tray_transaction" (
    "id" SERIAL NOT NULL,
    "order_sheet_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "tray_type_id" INTEGER NOT NULL,
    "opening_balance" INTEGER NOT NULL DEFAULT 0,
    "trays_taken" INTEGER NOT NULL DEFAULT 0,
    "trays_returned" INTEGER NOT NULL DEFAULT 0,
    "closing_balance" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_tray_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_brand" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "diary_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_client" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "shop_name" TEXT,
    "group_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supply_distributor_id" INTEGER,
    "distributor_id" INTEGER NOT NULL,

    CONSTRAINT "master_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_client_rate_product" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "selling_rate" DECIMAL(10,2) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "master_client_rate_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_diary" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "master_diary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_distributor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "master_distributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_driver" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "vehicle_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_group" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "distributor_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_product_type" (
    "id" SERIAL NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_product_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_packaging_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_packaging_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_tray_rule" (
    "id" SERIAL NOT NULL,
    "product_group_id" INTEGER NOT NULL,
    "brand_id" INTEGER,
    "product_type_id" INTEGER,
    "packaging_type_id" INTEGER,
    "tray_type_id" INTEGER NOT NULL,
    "applies_to_packaging" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_tray_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_product" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "product_group_id" INTEGER NOT NULL,
    "product_type_id" INTEGER,
    "packaging_type_id" INTEGER,
    "packaging_size" DECIMAL(10,2) NOT NULL,
    "packaging_unit" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_product_group" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_product_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_rate_product" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "purchase_rate" DECIMAL(10,2) NOT NULL,
    "selling_rate" DECIMAL(10,2) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "master_rate_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_tray_type" (
    "id" SERIAL NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uupdated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_tray_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_vehicle" (
    "id" SERIAL NOT NULL,
    "vehicle_number" TEXT NOT NULL,
    "vehicle_name" TEXT,
    "capacity" INTEGER,
    "distributor_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_paper" (
    "id" SERIAL NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL,
    "status" "OrderPaperStatus" NOT NULL DEFAULT 'DRAFT',
    "night_entry_submitted_at" TIMESTAMP(3),
    "morning_entry_submitted_at" TIMESTAMP(3),
    "finalized_at" TIMESTAMP(3),
    "reopened_at" TIMESTAMP(3),
    "reopen_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_sheet" (
    "id" SERIAL NOT NULL,
    "order_paper_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_sheet_items" (
    "id" SERIAL NOT NULL,
    "order_sheet_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "night_qty" DECIMAL(10,2),
    "final_qty" DECIMAL(10,2),
    "selling_rate" DECIMAL(10,2),
    "bill_amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_sheet_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_collection_client_id_idx" ON "client_collection"("client_id");

-- CreateIndex
CREATE INDEX "client_collection_order_sheet_id_idx" ON "client_collection"("order_sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_collection_order_sheet_id_client_id_key" ON "client_collection"("order_sheet_id", "client_id");

-- CreateIndex
CREATE INDEX "client_payment_client_id_idx" ON "client_payment"("client_id");

-- CreateIndex
CREATE INDEX "client_payment_payment_date_idx" ON "client_payment"("payment_date");

-- CreateIndex
CREATE INDEX "client_tray_transaction_client_id_idx" ON "client_tray_transaction"("client_id");

-- CreateIndex
CREATE INDEX "client_tray_transaction_order_sheet_id_idx" ON "client_tray_transaction"("order_sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_tray_transaction_order_sheet_id_client_id_tray_type__key" ON "client_tray_transaction"("order_sheet_id", "client_id", "tray_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "master_brand_name_key" ON "master_brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "master_client_code_key" ON "master_client"("code");

-- CreateIndex
CREATE UNIQUE INDEX "master_client_rate_product_client_id_product_id_effective_f_key" ON "master_client_rate_product"("client_id", "product_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "master_diary_name_key" ON "master_diary"("name");

-- CreateIndex
CREATE UNIQUE INDEX "master_distributor_name_key" ON "master_distributor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "master_group_vehicle_id_key" ON "master_group"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "master_group_distributor_id_name_key" ON "master_group"("distributor_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "master_product_type_brand_id_name_key" ON "master_product_type"("brand_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "master_packaging_type_name_key" ON "master_packaging_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "master_product_code_key" ON "master_product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "master_product_brand_id_product_group_id_product_type_id_pa_key" ON "master_product"("brand_id", "product_group_id", "product_type_id", "packaging_type_id", "packaging_size", "packaging_unit");

-- CreateIndex
CREATE UNIQUE INDEX "master_product_group_name_key" ON "master_product_group"("name");

-- CreateIndex
CREATE UNIQUE INDEX "master_tray_type_brand_id_color_key" ON "master_tray_type"("brand_id", "color");

-- CreateIndex
CREATE UNIQUE INDEX "master_vehicle_vehicle_number_key" ON "master_vehicle"("vehicle_number");

-- CreateIndex
CREATE UNIQUE INDEX "order_paper_order_date_key" ON "order_paper"("order_date");

-- CreateIndex
CREATE UNIQUE INDEX "order_sheet_order_paper_id_group_id_key" ON "order_sheet"("order_paper_id", "group_id");

-- CreateIndex
CREATE INDEX "order_sheet_items_client_id_idx" ON "order_sheet_items"("client_id");

-- CreateIndex
CREATE INDEX "order_sheet_items_order_sheet_id_idx" ON "order_sheet_items"("order_sheet_id");

-- CreateIndex
CREATE INDEX "order_sheet_items_product_id_idx" ON "order_sheet_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_sheet_items_order_sheet_id_client_id_product_id_key" ON "order_sheet_items"("order_sheet_id", "client_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "client_collection" ADD CONSTRAINT "client_collection_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "master_client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_collection" ADD CONSTRAINT "client_collection_order_sheet_id_fkey" FOREIGN KEY ("order_sheet_id") REFERENCES "order_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_payment" ADD CONSTRAINT "client_payment_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "master_client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tray_transaction" ADD CONSTRAINT "client_tray_transaction_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "master_client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tray_transaction" ADD CONSTRAINT "client_tray_transaction_order_sheet_id_fkey" FOREIGN KEY ("order_sheet_id") REFERENCES "order_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tray_transaction" ADD CONSTRAINT "client_tray_transaction_tray_type_id_fkey" FOREIGN KEY ("tray_type_id") REFERENCES "master_tray_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_brand" ADD CONSTRAINT "master_brand_diary_id_fkey" FOREIGN KEY ("diary_id") REFERENCES "master_diary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_client" ADD CONSTRAINT "master_client_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_client" ADD CONSTRAINT "master_client_supply_distributor_id_fkey" FOREIGN KEY ("supply_distributor_id") REFERENCES "master_distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_client" ADD CONSTRAINT "master_client_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "master_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_client_rate_product" ADD CONSTRAINT "master_client_rate_product_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "master_client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_client_rate_product" ADD CONSTRAINT "master_client_rate_product_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_driver" ADD CONSTRAINT "master_driver_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_group" ADD CONSTRAINT "master_group_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_group" ADD CONSTRAINT "master_group_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product_type" ADD CONSTRAINT "master_product_type_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "master_product_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "master_product_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_packaging_type_id_fkey" FOREIGN KEY ("packaging_type_id") REFERENCES "master_packaging_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_tray_type_id_fkey" FOREIGN KEY ("tray_type_id") REFERENCES "master_tray_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product" ADD CONSTRAINT "master_product_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product" ADD CONSTRAINT "master_product_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "master_product_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product" ADD CONSTRAINT "master_product_packaging_type_id_fkey" FOREIGN KEY ("packaging_type_id") REFERENCES "master_packaging_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product" ADD CONSTRAINT "master_product_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "master_product_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_rate_product" ADD CONSTRAINT "master_rate_product_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_tray_type" ADD CONSTRAINT "master_tray_type_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_vehicle" ADD CONSTRAINT "master_vehicle_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sheet" ADD CONSTRAINT "order_sheet_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "master_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sheet" ADD CONSTRAINT "order_sheet_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sheet_items" ADD CONSTRAINT "order_sheet_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "master_client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sheet_items" ADD CONSTRAINT "order_sheet_items_order_sheet_id_fkey" FOREIGN KEY ("order_sheet_id") REFERENCES "order_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sheet_items" ADD CONSTRAINT "order_sheet_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
