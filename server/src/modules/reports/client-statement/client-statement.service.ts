import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupplyCategory } from '../../../generated/prisma/client.js';
import { ClientStatementRepository } from './client-statement.repository.js';
import {
  ClientStatementProduct,
  ClientStatementReport,
  ClientStatementRow,
  ClientStatementTotals,
} from './dto/client-statement-response.dto.js';

@Injectable()
export class ClientStatementService {
  constructor(
    private readonly clientStatementRepository: ClientStatementRepository,
  ) {}

  async generateStatement(
    clientId: number,
    category: SupplyCategory,
    from: Date,
    to: Date,
  ): Promise<ClientStatementReport> {
    if (from > to) {
      throw new BadRequestException('From date cannot be greater than to date');
    }

    const client =
      await this.clientStatementRepository.findClientById(clientId);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const [sales, collections, previousSales, previousCollections] =
      await Promise.all([
        this.clientStatementRepository.findFinalizedClientSales(
          clientId,
          category,
          from,
          to,
        ),

        this.clientStatementRepository.findFinalizedClientCollections(
          clientId,
          category,
          from,
          to,
        ),

        this.clientStatementRepository.findFinalizedClientSalesBefore(
          clientId,
          category,
          from,
        ),

        this.clientStatementRepository.findFinalizedClientCollectionsBefore(
          clientId,
          category,
          from,
        ),
      ]);

    const openingOutstanding = this.calculateOutstanding(
      previousSales,
      previousCollections,
    );

    const products = this.getProducts(sales);

    const salesByDate = this.groupSalesByDate(sales);
    const collectionsByDate = this.groupCollectionsByDate(collections);

    const dates = this.getReportDates(salesByDate, collectionsByDate);

    let outstanding = openingOutstanding;

    const rows: ClientStatementRow[] = dates.map((date) => {
      const daySales = salesByDate.get(date) ?? [];
      const dayCollections = collectionsByDate.get(date) ?? [];

      const productQuantities = this.calculateProductQuantities(daySales);

      const bill = this.calculateBill(daySales);

      const cash = this.sumCollections(dayCollections, 'cash_collection');

      const officeAmountGiven = this.sumCollections(
        dayCollections,
        'office_amount_given',
      );

      const cheque = this.sumCollections(dayCollections, 'cheque_collection');

      const online = this.sumCollections(dayCollections, 'online_collection');

      const bankDeposit = this.sumCollections(dayCollections, 'bank_deposit');

      const totalPaid =
        cash + officeAmountGiven + cheque + online + bankDeposit;

      const dayBalance = bill - totalPaid;

      outstanding += dayBalance;

      return {
        date,
        products: productQuantities,
        bill,
        cash,
        officeAmountGiven,
        cheque,
        online,
        bankDeposit,
        totalPaid: this.round(totalPaid),
        dayBalance: this.round(dayBalance),
        outstanding: this.round(outstanding),
      };
    });

    const totals = this.calculateTotals(rows, products);

    return {
      client: {
        id: client.id,
        code: client.code,
        name: client.name,
        shopName: client.shop_name,
      },

      from: from.toISOString(),
      to: to.toISOString(),

      products,
      rows,
      totals,
    };
  }

  private calculateOutstanding(sales: any[], collections: any[]): number {
    const totalBill = sales.reduce(
      (sum, sale) => sum + Number(sale.final_bill_amount ?? 0),
      0,
    );

    const totalPaid = collections.reduce(
      (sum, collection) =>
        sum +
        Number(collection.cash_collection ?? 0) +
        Number(collection.office_amount_given ?? 0) +
        Number(collection.cheque_collection ?? 0) +
        Number(collection.online_collection ?? 0) +
        Number(collection.bank_deposit ?? 0),
      0,
    );

    return totalBill - totalPaid;
  }

  private getProducts(sales: any[]) {
    const productMap = new Map<
      number,
      {
        productId: number;
        productName: string;
      }
    >();

    for (const sale of sales) {
      const product = sale.master_product;

      if (!productMap.has(product.id)) {
        const parts = [
          product.master_brand?.name,
          product.master_product_group?.name,
          product.master_product_type?.name,
          product.master_packaging_type?.name,
          product.packaging_size != null
            ? `${product.packaging_size} ${product.packaging_unit}`
            : null,
        ].filter(Boolean);

        productMap.set(product.id, {
          productId: product.id,
          productName: parts.join(' '),
        });
      }
    }

    return Array.from(productMap.values());
  }

  private groupSalesByDate(sales: any[]) {
    const map = new Map<string, any[]>();

    for (const sale of sales) {
      const date = this.toDateKey(sale.order_sheet.order_paper.sale_date);

      const existing = map.get(date) ?? [];
      existing.push(sale);
      map.set(date, existing);
    }

    return map;
  }

  private groupCollectionsByDate(collections: any[]) {
    const map = new Map<string, any[]>();

    for (const collection of collections) {
      const date = this.toDateKey(collection.order_sheet.order_paper.sale_date);

      const existing = map.get(date) ?? [];
      existing.push(collection);
      map.set(date, existing);
    }

    return map;
  }

  private getReportDates(
    salesByDate: Map<string, any[]>,
    collectionsByDate: Map<string, any[]>,
  ): string[] {
    return Array.from(
      new Set([...salesByDate.keys(), ...collectionsByDate.keys()]),
    ).sort();
  }

  private calculateProductQuantities(sales: any[]) {
    const quantities: Record<string, number> = {};

    for (const sale of sales) {
      const productId = String(sale.master_product.id);

      quantities[productId] =
        (quantities[productId] ?? 0) + Number(sale.delivered_qty ?? 0);
    }

    return quantities;
  }

  private calculateBill(sales: any[]): number {
    return this.round(
      sales.reduce((sum, sale) => sum + Number(sale.final_bill_amount ?? 0), 0),
    );
  }

  private sumCollections(
    collections: any[],
    field:
      | 'cash_collection'
      | 'office_amount_given'
      | 'cheque_collection'
      | 'online_collection'
      | 'bank_deposit',
  ): number {
    return this.round(
      collections.reduce(
        (sum, collection) => sum + Number(collection[field] ?? 0),
        0,
      ),
    );
  }

  private calculateTotals(
    rows: ClientStatementRow[],
    products: ClientStatementProduct[],
  ): ClientStatementTotals {
    const productQuantities: Record<number, number> = {};

    for (const product of products) {
      productQuantities[product.productId] = this.round(
        rows.reduce(
          (sum, row) => sum + Number(row.products[product.productId] ?? 0),
          0,
        ),
      );
    }

    return {
      products: productQuantities,

      bill: this.round(rows.reduce((sum, row) => sum + row.bill, 0)),

      cash: this.round(rows.reduce((sum, row) => sum + row.cash, 0)),

      officeAmountGiven: this.round(
        rows.reduce((sum, row) => sum + row.officeAmountGiven, 0),
      ),

      cheque: this.round(rows.reduce((sum, row) => sum + row.cheque, 0)),

      online: this.round(rows.reduce((sum, row) => sum + row.online, 0)),

      bankDeposit: this.round(
        rows.reduce((sum, row) => sum + row.bankDeposit, 0),
      ),

      totalPaid: this.round(rows.reduce((sum, row) => sum + row.totalPaid, 0)),

      dayBalance: this.round(
        rows.reduce((sum, row) => sum + row.dayBalance, 0),
      ),

      outstanding: rows.length > 0 ? rows[rows.length - 1].outstanding : 0,
    };
  }

  private toDateKey(date: Date | string): string {
    return new Date(date).toISOString().slice(0, 10);
  }

  private round(value: number): number {
    return Number(value.toFixed(2));
  }
}
