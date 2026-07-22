import { Injectable, Logger } from '@nestjs/common';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { SupplyCategory } from '../../generated/prisma/client.js';
import {
  CollectionSheet,
  CollectionClient,
  SavedCollection,
  CollectionGrid,
} from '../../types/collection.types.js';

@Injectable()
export class CollectionBuilder {
  constructor(private readonly workflowState: WorkflowStateService) {}

  buildCollectionSection(
    sheet: CollectionSheet,
    milkClients: CollectionClient[],
    nonMilkClients: CollectionClient[],
    savedCollections: SavedCollection[],
  ) {
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
      orderSheetId: sheet.id,
      groupId: sheet.group_id,
      groupName: sheet.master_group?.name,
      paperStatus: sheet.order_paper?.status,
      permissions,
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
      columns,
      rows,
      totals,
    };
  }
}
