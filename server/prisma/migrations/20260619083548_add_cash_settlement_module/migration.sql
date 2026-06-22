-- CreateTable
CREATE TABLE "master_bank" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_employee" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_expense_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_expense_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_route_settlement" (
    "id" SERIAL NOT NULL,
    "order_sheet_id" INTEGER NOT NULL,
    "note_2000" INTEGER NOT NULL DEFAULT 0,
    "note_500" INTEGER NOT NULL DEFAULT 0,
    "note_200" INTEGER NOT NULL DEFAULT 0,
    "note_100" INTEGER NOT NULL DEFAULT 0,
    "note_50" INTEGER NOT NULL DEFAULT 0,
    "note_20" INTEGER NOT NULL DEFAULT 0,
    "note_10" INTEGER NOT NULL DEFAULT 0,
    "coins" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_route_settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_route_expense" (
    "id" SERIAL NOT NULL,
    "cash_route_settlement_id" INTEGER NOT NULL,
    "expense_type_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_route_expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_direct_collection" (
    "id" SERIAL NOT NULL,
    "order_paper_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "note_2000" INTEGER NOT NULL DEFAULT 0,
    "note_500" INTEGER NOT NULL DEFAULT 0,
    "note_200" INTEGER NOT NULL DEFAULT 0,
    "note_100" INTEGER NOT NULL DEFAULT 0,
    "note_50" INTEGER NOT NULL DEFAULT 0,
    "note_20" INTEGER NOT NULL DEFAULT 0,
    "note_10" INTEGER NOT NULL DEFAULT 0,
    "coins" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_direct_collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_bank_deposit" (
    "id" SERIAL NOT NULL,
    "order_paper_id" INTEGER NOT NULL,
    "bank_id" INTEGER NOT NULL,
    "note_2000" INTEGER NOT NULL DEFAULT 0,
    "note_500" INTEGER NOT NULL DEFAULT 0,
    "note_200" INTEGER NOT NULL DEFAULT 0,
    "note_100" INTEGER NOT NULL DEFAULT 0,
    "note_50" INTEGER NOT NULL DEFAULT 0,
    "note_20" INTEGER NOT NULL DEFAULT 0,
    "note_10" INTEGER NOT NULL DEFAULT 0,
    "coins" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit_date" DATE NOT NULL,
    "deposit_reference" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_bank_deposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_bank_name_key" ON "master_bank"("name");

-- CreateIndex
CREATE UNIQUE INDEX "master_employee_name_key" ON "master_employee"("name");

-- CreateIndex
CREATE UNIQUE INDEX "master_expense_type_name_key" ON "master_expense_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cash_route_settlement_order_sheet_id_key" ON "cash_route_settlement"("order_sheet_id");

-- CreateIndex
CREATE INDEX "cash_route_expense_cash_route_settlement_id_idx" ON "cash_route_expense"("cash_route_settlement_id");

-- CreateIndex
CREATE INDEX "cash_route_expense_expense_type_id_idx" ON "cash_route_expense"("expense_type_id");

-- CreateIndex
CREATE INDEX "cash_direct_collection_order_paper_id_idx" ON "cash_direct_collection"("order_paper_id");

-- CreateIndex
CREATE INDEX "cash_direct_collection_employee_id_idx" ON "cash_direct_collection"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_direct_collection_order_paper_id_employee_id_key" ON "cash_direct_collection"("order_paper_id", "employee_id");

-- CreateIndex
CREATE INDEX "cash_bank_deposit_order_paper_id_idx" ON "cash_bank_deposit"("order_paper_id");

-- CreateIndex
CREATE INDEX "cash_bank_deposit_bank_id_idx" ON "cash_bank_deposit"("bank_id");

-- AddForeignKey
ALTER TABLE "cash_route_settlement" ADD CONSTRAINT "cash_route_settlement_order_sheet_id_fkey" FOREIGN KEY ("order_sheet_id") REFERENCES "order_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_route_expense" ADD CONSTRAINT "cash_route_expense_cash_route_settlement_id_fkey" FOREIGN KEY ("cash_route_settlement_id") REFERENCES "cash_route_settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_route_expense" ADD CONSTRAINT "cash_route_expense_expense_type_id_fkey" FOREIGN KEY ("expense_type_id") REFERENCES "master_expense_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_direct_collection" ADD CONSTRAINT "cash_direct_collection_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "master_employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_direct_collection" ADD CONSTRAINT "cash_direct_collection_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_deposit" ADD CONSTRAINT "cash_bank_deposit_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "master_bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_bank_deposit" ADD CONSTRAINT "cash_bank_deposit_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;
