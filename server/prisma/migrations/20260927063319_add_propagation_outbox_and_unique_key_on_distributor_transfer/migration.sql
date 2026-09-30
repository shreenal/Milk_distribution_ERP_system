/*
  Warnings:

  - A unique constraint covering the columns `[order_paper_id,supplier_distributor_id,owner_distributor_id,product_id]` on the table `distributor_transfer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "propagation_outbox" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "paper_id" INTEGER NOT NULL,
    "resume_from_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "propagation_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "propagation_outbox_status_idx" ON "propagation_outbox"("status");

-- CreateIndex
CREATE INDEX "propagation_outbox_paper_id_idx" ON "propagation_outbox"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_transfer_order_paper_id_supplier_distributor_id_key" ON "distributor_transfer"("order_paper_id", "supplier_distributor_id", "owner_distributor_id", "product_id");
