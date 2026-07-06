-- CreateTable
CREATE TABLE "master_client_category" (
    "client_id" INTEGER NOT NULL,
    "category" "SupplyCategory" NOT NULL,

    CONSTRAINT "master_client_category_pkey" PRIMARY KEY ("client_id","category")
);

-- AddForeignKey
ALTER TABLE "master_client_category" ADD CONSTRAINT "master_client_category_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "master_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
