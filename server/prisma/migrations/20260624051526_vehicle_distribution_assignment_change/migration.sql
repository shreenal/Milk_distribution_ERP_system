/*
  Vehicle distribution assignment is being refactored from:
  paper + vehicle -> distributor

  to:
  paper + vehicle + category -> distributor

  Existing rows are based on the old model and are not safely migratable,
  so delete them before adding the required category column.
*/

-- Delete old invalid assignment data
DELETE FROM "vehicle_distribution_assignment";

-- Drop old unique index
DROP INDEX "vehicle_distribution_assignment_vehicle_allocation_paper_id_key";

-- Add new required category column
ALTER TABLE "vehicle_distribution_assignment"
ADD COLUMN "category" "SupplyCategory" NOT NULL;

-- Add new unique index for vehicle + category assignment
CREATE UNIQUE INDEX "vehicle_distribution_assignment_vehicle_allocation_paper_id_key"
ON "vehicle_distribution_assignment"("vehicle_allocation_paper_id", "vehicle_id", "category");