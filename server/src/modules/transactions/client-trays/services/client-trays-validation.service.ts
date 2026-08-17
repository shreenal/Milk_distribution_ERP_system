import { Injectable, BadRequestException } from '@nestjs/common';
import { CLIENT_TRAY_ERROR_MESSAGES } from '../client-trays.constants.js';
import { ClientTraysRepository } from '../client-trays.repository.js';
import { PrismaOrTransaction } from '../../../../types/transaction.types.js';

@Injectable()
export class ClientTraysValidationService {
  constructor(private readonly clientTraysRepository: ClientTraysRepository) {}

  async validateTrayCompleteness(
    sheetId: number,
    db: PrismaOrTransaction,
  ): Promise<void> {
    const transactions = await this.clientTraysRepository.getTrayTransactions(
      sheetId,
      db,
    );

    if (transactions.length === 0) {
      return;
    }

    for (const transaction of transactions) {
      const traysTaken = Number(transaction.trays_taken ?? 0);
      const openingBalance = Number(transaction.opening_balance ?? 0);
      const traysReturned = transaction.trays_returned;

      if (traysTaken > 0 || openingBalance > 0) {
        if (traysReturned === null || traysReturned === undefined) {
          throw new BadRequestException(
            CLIENT_TRAY_ERROR_MESSAGES.INCOMPLETE_TRAY_RETURNS(
              String(transaction.master_client.name),
            ),
          );
        }
      }
    }
  }

  async validateTrayCalculationExists(
    sheetId: number,
    db: PrismaOrTransaction = this.clientTraysRepository['prisma'],
  ): Promise<void> {
    const transactions = await this.clientTraysRepository.getTrayTransactions(
      sheetId,
      db,
    );

    if (transactions.length === 0) {
      throw new BadRequestException(
        CLIENT_TRAY_ERROR_MESSAGES.CALCULATION_FAILED,
      );
    }
  }
}
