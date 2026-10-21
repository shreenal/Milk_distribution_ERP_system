import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';

// Required on every manual generation. Explicit null is accepted by the DTO
// and is always a 409 in the service (a paper always has a token).
export class GenerateTransferDto {
  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
