-- CreateTable
CREATE TABLE "order_sheet_product" (
    "id" SERIAL NOT NULL,
    "order_sheet_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "product_link_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_sheet_product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_sheet_product_order_sheet_id_idx" ON "order_sheet_product"("order_sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_sheet_product_order_sheet_id_product_id_key" ON "order_sheet_product"("order_sheet_id", "product_id");

-- AddForeignKey
ALTER TABLE "order_sheet_product" ADD CONSTRAINT "order_sheet_product_order_sheet_id_fkey" FOREIGN KEY ("order_sheet_id") REFERENCES "order_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sheet_product" ADD CONSTRAINT "order_sheet_product_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sheet_product" ADD CONSTRAINT "order_sheet_product_product_link_id_fkey" FOREIGN KEY ("product_link_id") REFERENCES "master_product_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
