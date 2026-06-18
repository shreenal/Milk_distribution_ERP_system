import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { OrderPaperStatus } from '../../generated/prisma/client.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';

type CollectionSheet = Prisma.order_sheetGetPayload<{
  include: {
    master_group: true;
    order_paper: true;
  };
}>;

type CollectionClient = Prisma.master_clientGetPayload<{}>;

type SavedCollection = Prisma.client_collectionGetPayload<{}>;
@Injectable()
export class CollectionBuilder {
  private readonly logger = new Logger(CollectionBuilder.name);

  constructor(private readonly workflowState: WorkflowStateService) {}

  buildCollectionGrid(
    sheet: CollectionSheet,
    clients: CollectionClient[],
    savedCollections: SavedCollection[],
  ) {
    this.logger.debug(`Building collection grid for sheet ${sheet.id}`);

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

    const status = sheet.order_paper?.status;

    const permissions = {
      canEditNightCollections:
        this.workflowState.canEditNightCollections(status),

      canEditMorningCollections:
        this.workflowState.canEditMorningCollections(status),

      canEditAdminCollections:
        this.workflowState.canAdminEditCollections(status),

      canFinalize: this.workflowState.canFinalize(status),
    };

    const rows = clients.map((client) => {
      const saved = savedCollections.find(
        (collection) => collection.client_id === client.id,
      );

      const cashCollection = Number(saved?.cash_collection ?? 0);

      const officeAmountGiven = Number(saved?.office_amount_given ?? 0);

      const chequeCollection = Number(saved?.cheque_collection ?? 0);

      const onlineCollection = Number(saved?.online_collection ?? 0);

      const bankDeposit = Number(saved?.bank_deposit ?? 0);

      const employeeTotal =
        cashCollection + officeAmountGiven + chequeCollection;

      const adminTotal = onlineCollection + bankDeposit;

      const grandTotal = employeeTotal + adminTotal;

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

      cashCollection: Number(
        rows
          .reduce(
            (sum, row) => sum + row.cashCollection,

            0,
          )
          .toFixed(2),
      ),

      officeAmountGiven: Number(
        rows
          .reduce(
            (sum, row) => sum + row.officeAmountGiven,

            0,
          )
          .toFixed(2),
      ),

      chequeCollection: Number(
        rows
          .reduce(
            (sum, row) => sum + row.chequeCollection,

            0,
          )
          .toFixed(2),
      ),

      onlineCollection: Number(
        rows
          .reduce(
            (sum, row) => sum + row.onlineCollection,

            0,
          )
          .toFixed(2),
      ),

      bankDeposit: Number(
        rows
          .reduce(
            (sum, row) => sum + row.bankDeposit,

            0,
          )
          .toFixed(2),
      ),

      employeeTotal: Number(
        rows
          .reduce(
            (sum, row) => sum + row.employeeTotal,

            0,
          )
          .toFixed(2),
      ),

      adminTotal: Number(
        rows
          .reduce(
            (sum, row) => sum + row.adminTotal,

            0,
          )
          .toFixed(2),
      ),

      grandTotal: Number(
        rows
          .reduce(
            (sum, row) => sum + row.grandTotal,

            0,
          )
          .toFixed(2),
      ),
    };

    return {
      orderSheetId: sheet.id,

      groupId: sheet.group_id,

      groupName: sheet.master_group?.name,

      paperStatus: sheet.order_paper?.status,

      permissions,

      columns,

      rows,

      totals,
    };
  }
}
