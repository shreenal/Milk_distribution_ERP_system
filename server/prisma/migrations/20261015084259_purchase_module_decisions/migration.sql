-- AlterTable
ALTER TABLE "purchase_paper" ADD COLUMN     "signed_off_at" TIMESTAMP(3),
ADD COLUMN     "signed_off_by" INTEGER;

-- AddForeignKey
ALTER TABLE "purchase_paper" ADD CONSTRAINT "purchase_paper_signed_off_by_fkey" FOREIGN KEY ("signed_off_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
