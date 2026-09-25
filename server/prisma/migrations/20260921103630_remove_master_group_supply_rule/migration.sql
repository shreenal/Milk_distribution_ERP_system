/*
  Warnings:

  - You are about to drop the `master_group_supply_rule` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "master_group_supply_rule" DROP CONSTRAINT "master_group_supply_rule_distributor_id_fkey";

-- DropForeignKey
ALTER TABLE "master_group_supply_rule" DROP CONSTRAINT "master_group_supply_rule_group_id_fkey";

-- DropTable
DROP TABLE "master_group_supply_rule";
