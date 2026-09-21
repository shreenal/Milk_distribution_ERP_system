-- CreateTable
CREATE TABLE "distributor_product_priority" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "distributor_id" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_product_priority_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distributor_product_priority_product_id_priority_idx" ON "distributor_product_priority"("product_id", "priority");

-- CreateIndex
CREATE INDEX "distributor_product_priority_distributor_id_idx" ON "distributor_product_priority"("distributor_id");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_product_priority_product_id_distributor_id_key" ON "distributor_product_priority"("product_id", "distributor_id");

-- AddForeignKey
ALTER TABLE "distributor_product_priority" ADD CONSTRAINT "distributor_product_priority_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_product_priority" ADD CONSTRAINT "distributor_product_priority_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
