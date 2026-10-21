import { ExpectedUpdatedAt } from '../../../../common/dto/expected-updated-at.decorator.js';

export class SignOffZeroAllocationDto {
  @ExpectedUpdatedAt()
  expectedUpdatedAt!: string | null;
}
