-- CreateEnum
CREATE TYPE "PaperAuditAction" AS ENUM ('GENERATED', 'GENERATED_BACKFILL', 'NIGHT_SUBMITTED', 'MORNING_SUBMITTED', 'MORNING_REVERTED', 'FINALIZED', 'REOPENED', 'SHEET_OPERATION_CHANGED', 'PROPAGATION_RETRIED', 'PROPAGATION_DISMISSED');

-- AlterTable
ALTER TABLE "order_sheet" ADD COLUMN     "no_operation" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "paper_audit_log" (
    "id" SERIAL NOT NULL,
    "order_paper_id" INTEGER NOT NULL,
    "action" "PaperAuditAction" NOT NULL,
    "from_status" "OrderPaperStatus",
    "to_status" "OrderPaperStatus",
    "user_id" INTEGER,
    "reason" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paper_audit_log_order_paper_id_created_at_idx" ON "paper_audit_log"("order_paper_id", "created_at");

-- CreateIndex
CREATE INDEX "paper_audit_log_user_id_idx" ON "paper_audit_log"("user_id");

-- AddForeignKey
ALTER TABLE "paper_audit_log" ADD CONSTRAINT "paper_audit_log_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_audit_log" ADD CONSTRAINT "paper_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
