import { IsEnum } from 'class-validator';
import { DeliverySession } from '../../../../generated/prisma/client.js';
import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';

export class ReconcileVehicleAllocationDto {
  @IsEnum(DeliverySession)
  session!: DeliverySession;

  // VA-9.2: same mandatory token contract as save.
  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
