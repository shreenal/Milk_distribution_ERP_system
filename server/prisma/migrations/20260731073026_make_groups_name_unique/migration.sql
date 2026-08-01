/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `master_group` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "master_group_name_key" ON "master_group"("name");
