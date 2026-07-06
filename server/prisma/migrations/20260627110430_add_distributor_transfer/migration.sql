-- CreateTable
CREATE TABLE "distributor_transfer" (
    "id" SERIAL NOT NULL,
    "order_paper_id" INTEGER NOT NULL,
    "supplier_distributor_id" INTEGER NOT NULL,
    "owner_distributor_id" INTEGER NOT NULL,
    "billing_group_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "transfer_qty" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distributor_transfer_order_paper_id_idx" ON "distributor_transfer"("order_paper_id");

-- CreateIndex
CREATE INDEX "distributor_transfer_supplier_distributor_id_idx" ON "distributor_transfer"("supplier_distributor_id");

-- CreateIndex
CREATE INDEX "distributor_transfer_owner_distributor_id_idx" ON "distributor_transfer"("owner_distributor_id");

-- CreateIndex
CREATE INDEX "distributor_transfer_billing_group_id_idx" ON "distributor_transfer"("billing_group_id");

-- CreateIndex
CREATE INDEX "distributor_transfer_product_id_idx" ON "distributor_transfer"("product_id");

-- CreateIndex
CREATE INDEX "distributor_transfer_order_paper_id_supplier_distributor_id_idx" ON "distributor_transfer"("order_paper_id", "supplier_distributor_id");

-- CreateIndex
CREATE INDEX "distributor_transfer_order_paper_id_owner_distributor_id_idx" ON "distributor_transfer"("order_paper_id", "owner_distributor_id");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_transfer_order_paper_id_supplier_distributor_id_key" ON "distributor_transfer"("order_paper_id", "supplier_distributor_id", "owner_distributor_id", "billing_group_id", "product_id");

-- AddForeignKey
ALTER TABLE "distributor_transfer" ADD CONSTRAINT "distributor_transfer_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_transfer" ADD CONSTRAINT "distributor_transfer_supplier_distributor_id_fkey" FOREIGN KEY ("supplier_distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_transfer" ADD CONSTRAINT "distributor_transfer_owner_distributor_id_fkey" FOREIGN KEY ("owner_distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_transfer" ADD CONSTRAINT "distributor_transfer_billing_group_id_fkey" FOREIGN KEY ("billing_group_id") REFERENCES "master_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_transfer" ADD CONSTRAINT "distributor_transfer_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
