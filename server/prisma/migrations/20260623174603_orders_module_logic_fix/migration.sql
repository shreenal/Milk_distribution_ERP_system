-- CreateEnum
CREATE TYPE "SupplyCategory" AS ENUM ('MILK', 'NON_MILK');

-- CreateTable
CREATE TABLE "master_group_supply_rule" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "category" "SupplyCategory" NOT NULL,
    "distributor_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_group_supply_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "master_group_supply_rule_group_id_idx" ON "master_group_supply_rule"("group_id");

-- CreateIndex
CREATE INDEX "master_group_supply_rule_distributor_id_idx" ON "master_group_supply_rule"("distributor_id");

-- CreateIndex
CREATE UNIQUE INDEX "master_group_supply_rule_group_id_category_key" ON "master_group_supply_rule"("group_id", "category");

-- AddForeignKey
ALTER TABLE "master_group_supply_rule" ADD CONSTRAINT "master_group_supply_rule_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "master_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_group_supply_rule" ADD CONSTRAINT "master_group_supply_rule_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
