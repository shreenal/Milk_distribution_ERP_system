import { Injectable } from '@nestjs/common';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { SupplyCategory } from '../../../generated/prisma/client.js';
import {
  CollectionClient,
  CollectionColumnNode,
  CollectionGrid,
  CollectionRow,
  CollectionSheet,
  CollectionTotals,
  SavedCollection,
} from '../../../types/collection.types.js';
import {
  Decimal,
  toDecimal,
  toMoney,
} from '../../../common/utils/money.util.js';

@Injectable()
export class CollectionBuilder {
  constructor(private readonly workflowBuilder: WorkflowBuilder) {}

  buildCollectionSection(
    sheet: CollectionSheet,
    milkClients: CollectionClient[],
    nonMilkClients: CollectionClient[],
    savedCollections: SavedCollection[],
    includeAdminColumns: boolean,
  ) {
    const workflow = this.workflowBuilder.buildCollectionsWorkflow(
      sheet.order_paper.status,
    );

    const milkCollectionGrid = this.buildGrid(
      milkClients,
      savedCollections.filter((c) => c.category === SupplyCategory.MILK),
      includeAdminColumns,
    );

    const nonMilkCollectionGrid = this.buildGrid(
      nonMilkClients,
      savedCollections.filter((c) => c.category === SupplyCategory.NON_MILK),
      includeAdminColumns,
    );

    // CD-3.1: a lean projection, not the raw order_sheet row. The concurrency
    // token is a top-level field, as in Orders.
    return {
      sheet: {
        id: sheet.id,
        orderPaperId: sheet.order_paper_id,
        groupId: sheet.group_id,
        groupName: sheet.master_group.name,
      },
      workflow,
      collectionsUpdatedAt: sheet.collections_updated_at?.toISOString() ?? null,
      milkCollectionGrid,
      nonMilkCollectionGrid,
    };
  }

  buildGrid(
    clients: CollectionClient[],
    savedCollections: SavedCollection[],
    includeAdminColumns: boolean,
  ): CollectionGrid {
    const columns: CollectionColumnNode[] = [
      { field: 'clientCode', headerName: 'Client Code', editable: false },

      { field: 'clientName', headerName: 'Client Name', editable: false },

      {
        headerName: 'Night Entry',
        children: [
          {
            field: 'officeCashCollection',
            headerName: 'Office Cash Collection',
          },
        ],
      },

      {
        headerName: 'Morning Entry',
        children: [
          { field: 'cashCollection', headerName: 'Cash Collection' },
          { field: 'chequeCollection', headerName: 'Cheque Collection' },
        ],
      },

      {
        field: 'employeeTotal',
        headerName: 'Total (Employee)',
        editable: false,
      },
    ];

    // CD-3.8: admin financial columns exist only for admin callers.
    if (includeAdminColumns) {
      columns.push(
        {
          headerName: 'Admin Entry',
          children: [
            {
              field: 'onlineCollection',
              headerName: 'Online Collection (UPI)',
            },
            { field: 'bankDeposit', headerName: 'Bank Deposit' },
          ],
        },
        { field: 'adminTotal', headerName: 'Total (Admin)', editable: false },
        { field: 'grandTotal', headerName: 'Grand Total', editable: false },
      );
    }

    const savedByClient = new Map(
      savedCollections.map((c) => [c.client_id, c]),
    );

    const rows: CollectionRow[] = clients.map((client) => {
      const saved = savedByClient.get(client.id);

      const officeCashCollection = Number(saved?.office_cash_collection ?? 0);
      const cashCollection = Number(saved?.cash_collection ?? 0);
      const chequeCollection = Number(saved?.cheque_collection ?? 0);

      const employeeTotal = toMoney(
        toDecimal(cashCollection)
          .plus(officeCashCollection)
          .plus(chequeCollection),
      );

      const row: CollectionRow = {
        collectionId: saved?.id ?? null,
        clientId: client.id,
        clientCode: client.code,
        clientName: client.name,
        officeCashCollection,
        cashCollection,
        chequeCollection,
        employeeTotal,
      };

      if (includeAdminColumns) {
        const onlineCollection = Number(saved?.online_collection ?? 0);
        const bankDeposit = Number(saved?.bank_deposit ?? 0);
        const adminTotal = toMoney(
          toDecimal(onlineCollection).plus(bankDeposit),
        );

        row.onlineCollection = onlineCollection;
        row.bankDeposit = bankDeposit;
        row.adminTotal = adminTotal;
        row.grandTotal = toMoney(toDecimal(employeeTotal).plus(adminTotal));
      }

      return row;
    });

    const sum = (pick: (row: CollectionRow) => number | undefined) =>
      toMoney(rows.reduce((s, r) => s.plus(pick(r) ?? 0), new Decimal(0)));

    const totals: CollectionTotals = {
      totalClients: rows.length,
      officeCashCollection: sum((r) => r.officeCashCollection),
      cashCollection: sum((r) => r.cashCollection),
      chequeCollection: sum((r) => r.chequeCollection),
      employeeTotal: sum((r) => r.employeeTotal),
    };

    if (includeAdminColumns) {
      totals.onlineCollection = sum((r) => r.onlineCollection);
      totals.bankDeposit = sum((r) => r.bankDeposit);
      totals.adminTotal = sum((r) => r.adminTotal);
      totals.grandTotal = sum((r) => r.grandTotal);
    }

    return { columns, rows, totals };
  }
}
