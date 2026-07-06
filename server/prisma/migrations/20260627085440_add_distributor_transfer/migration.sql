/*
  Warnings:

  - Added the required column `owner_distributor_id` to the `master_client` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "master_client" ADD COLUMN     "owner_distributor_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "distributor_transfer_rule" (
    "id" SERIAL NOT NULL,
    "supplier_distributor_id" INTEGER NOT NULL,
    "owner_distributor_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_transfer_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distributor_transfer_rule_supplier_distributor_id_idx" ON "distributor_transfer_rule"("supplier_distributor_id");

-- CreateIndex
CREATE INDEX "distributor_transfer_rule_owner_distributor_id_idx" ON "distributor_transfer_rule"("owner_distributor_id");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_transfer_rule_supplier_distributor_id_owner_dis_key" ON "distributor_transfer_rule"("supplier_distributor_id", "owner_distributor_id");

-- AddForeignKey
ALTER TABLE "master_client" ADD CONSTRAINT "master_client_owner_distributor_id_fkey" FOREIGN KEY ("owner_distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_transfer_rule" ADD CONSTRAINT "distributor_transfer_rule_supplier_distributor_id_fkey" FOREIGN KEY ("supplier_distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_transfer_rule" ADD CONSTRAINT "distributor_transfer_rule_owner_distributor_id_fkey" FOREIGN KEY ("owner_distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
