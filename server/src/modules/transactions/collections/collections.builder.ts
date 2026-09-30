import { Injectable } from '@nestjs/common';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';
import { SupplyCategory } from '../../../generated/prisma/client.js';
import {
  CollectionSheet,
  CollectionClient,
  SavedCollection,
  CollectionGrid,
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
  ) {
    const workflow = this.workflowBuilder.buildCollectionsWorkflow(
      sheet.order_paper.status,
    );

    const milkCollections = savedCollections.filter(
      (collection) => collection.category === SupplyCategory.MILK,
    );

    const nonMilkCollections = savedCollections.filter(
      (collection) => collection.category === SupplyCategory.NON_MILK,
    );

    const milkCollectionGrid = this.buildGrid(
      sheet,
      milkClients,
      milkCollections,
    );

    const nonMilkCollectionGrid = this.buildGrid(
      sheet,
      nonMilkClients,
      nonMilkCollections,
    );

    return {
      sheet,
      workflow,
      milkCollectionGrid,
      nonMilkCollectionGrid,
    };
  }

  private buildGrid(
    sheet: CollectionSheet,
    clients: CollectionClient[],
    savedCollections: SavedCollection[],
  ): CollectionGrid {
    const columns = [
      {
        field: 'clientCode',
        headerName: 'Client Code',
        editable: false,
      },

      {
        field: 'clientName',
        headerName: 'Client Name',
        editable: false,
      },

      {
        headerName: 'Night Entry',

        children: [
          {
            field: 'officeAmountGiven',
            headerName: 'Office Amount Given',
          },
        ],
      },

      {
        headerName: 'Morning Entry',

        children: [
          {
            field: 'cashCollection',
            headerName: 'Cash Collection',
          },

          {
            field: 'chequeCollection',
            headerName: 'Cheque Collection',
          },

          {
            field: 'employeeRemarks',
            headerName: 'Employee Remarks',
          },
        ],
      },

      {
        field: 'employeeTotal',

        headerName: 'Total (Employee)',

        editable: false,
      },

      {
        headerName: 'Admin Entry',

        children: [
          {
            field: 'onlineCollection',
            headerName: 'Online Collection (UPI)',
          },

          {
            field: 'bankDeposit',
            headerName: 'Bank Deposit',
          },

          {
            field: 'adminRemarks',
            headerName: 'Admin Remarks',
          },
        ],
      },

      {
        field: 'adminTotal',

        headerName: 'Total (Admin)',

        editable: false,
      },

      {
        field: 'grandTotal',

        headerName: 'Grand Total',

        editable: false,
      },
    ];

    const rows = clients.map((client) => {
      const saved = savedCollections.find(
        (collection) => collection.client_id === client.id,
      );

      const cashCollection = Number(saved?.cash_collection ?? 0);

      const officeAmountGiven = Number(saved?.office_amount_given ?? 0);

      const chequeCollection = Number(saved?.cheque_collection ?? 0);

      const onlineCollection = Number(saved?.online_collection ?? 0);

      const bankDeposit = Number(saved?.bank_deposit ?? 0);

      const employeeTotal = toMoney(
        toDecimal(cashCollection)
          .plus(officeAmountGiven)
          .plus(chequeCollection),
      );
      const adminTotal = toMoney(toDecimal(onlineCollection).plus(bankDeposit));
      const grandTotal = toMoney(toDecimal(employeeTotal).plus(adminTotal));

      return {
        collectionId: saved?.id ?? null,

        clientId: client.id,

        clientCode: client.code,

        clientName: client.name,

        cashCollection,

        officeAmountGiven,

        chequeCollection,

        onlineCollection,

        bankDeposit,

        employeeRemarks: saved?.employee_remarks ?? null,

        adminRemarks: saved?.admin_remarks ?? null,

        employeeTotal: Number(employeeTotal.toFixed(2)),

        adminTotal: Number(adminTotal.toFixed(2)),

        grandTotal: Number(grandTotal.toFixed(2)),
      };
    });

    const totals = {
      totalClients: rows.length,

      cashCollection: toMoney(
        rows.reduce((sum, row) => sum.plus(row.cashCollection), new Decimal(0)),
      ),

      officeAmountGiven: toMoney(
        rows.reduce(
          (sum, row) => sum.plus(row.officeAmountGiven),
          new Decimal(0),
        ),
      ),

      chequeCollection: toMoney(
        rows.reduce(
          (sum, row) => sum.plus(row.chequeCollection),
          new Decimal(0),
        ),
      ),

      onlineCollection: toMoney(
        rows.reduce(
          (sum, row) => sum.plus(row.onlineCollection),
          new Decimal(0),
        ),
      ),

      bankDeposit: toMoney(
        rows.reduce((sum, row) => sum.plus(row.bankDeposit), new Decimal(0)),
      ),

      employeeTotal: toMoney(
        rows.reduce((sum, row) => sum.plus(row.employeeTotal), new Decimal(0)),
      ),

      adminTotal: toMoney(
        rows.reduce((sum, row) => sum.plus(row.adminTotal), new Decimal(0)),
      ),

      grandTotal: toMoney(
        rows.reduce((sum, row) => sum.plus(row.grandTotal), new Decimal(0)),
      ),
    };
    return {
      columns,
      rows,
      totals,
    };
  }
}
