import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, tokenHash: string, expiresAt: Date) {
    return this.prisma.refresh_token.create({
      data: { user_id: userId, token_hash: tokenHash, expires_at: expiresAt },
    });
  }

  async findByHash(tokenHash: string) {
    return this.prisma.refresh_token.findUnique({
      where: { token_hash: tokenHash },
    });
  }

  async revoke(id: number, replacedById?: number) {
    return this.prisma.refresh_token.update({
      where: { id },
      data: { revoked_at: new Date(), replaced_by: replacedById },
    });
  }

  async revokeAllForUser(userId: number) {
    return this.prisma.refresh_token.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  /**
   * M9: atomically claims this token for rotation — flips revoked_at
   * only if it's still null. Two concurrent refresh calls with the same
   * token can now only have one winner; the loser sees count=0 instead
   * of both successfully issuing a new token pair.
   */
  async claimForRotation(id: number): Promise<boolean> {
    const result = await this.prisma.refresh_token.updateMany({
      where: { id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return result.count === 1;
  }

  async setReplacedBy(id: number, replacedById: number) {
    return this.prisma.refresh_token.update({
      where: { id },
      data: { replaced_by: replacedById },
    });
  }
}
