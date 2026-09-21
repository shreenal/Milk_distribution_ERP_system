-- DropForeignKey
ALTER TABLE "product_order_unit" DROP CONSTRAINT "product_order_unit_order_unit_type_id_fkey";

-- CreateTable
CREATE TABLE "master_order_unit_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_order_unit_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_order_unit_type_name_key" ON "master_order_unit_type"("name");

-- AddForeignKey
ALTER TABLE "product_order_unit" ADD CONSTRAINT "product_order_unit_order_unit_type_id_fkey" FOREIGN KEY ("order_unit_type_id") REFERENCES "master_order_unit_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
