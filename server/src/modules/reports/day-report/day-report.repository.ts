import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { OrderPaperStatus } from '../../../generated/prisma/client.js';

@Injectable()
export class DayReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrderPaperBySaleDate(saleDate: Date) {
    return this.prisma.order_paper.findFirst({
      where: {
        sale_date: saleDate,
        status: OrderPaperStatus.FINALIZED,
      },
      select: {
        id: true,
        sale_date: true,
        status: true,
      },
    });
  }

  async getSalesData(paperId: number) {
    return this.prisma.order_sheet_items.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },
      select: {
        client_id: true,
        product_id: true,
        delivered_qty: true,

        final_selling_rate: true,
        final_taxable_amount: true,
        final_gst_percentage: true,
        final_gst_amount: true,
        final_bill_amount: true,

        master_product: {
          select: {
            id: true,
            code: true,
            packaging_size: true,
            packaging_unit: true,

            master_brand: {
              select: {
                id: true,
                name: true,
              },
            },

            master_product_group: {
              select: {
                id: true,
                name: true,
                category: true,
              },
            },

            master_product_type: {
              select: {
                id: true,
                name: true,
              },
            },

            master_packaging_type: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async getCollectionsData(paperId: number) {
    return this.prisma.client_collection.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },
      select: {
        client_id: true,
        category: true,

        cash_collection: true,
        office_amount_given: true,
        cheque_collection: true,
        online_collection: true,
        bank_deposit: true,
      },
    });
  }

  async getPurchaseData(paperId: number) {
    return this.prisma.purchase_entry.findMany({
      where: {
        purchase_paper: {
          order_paper_id: paperId,
        },
      },

      select: {
        id: true,
        vehicle_id: true,
        product_id: true,
        distributor_id: true,

        purchased_qty: true,
        purchase_rate: true,
        purchase_amount: true,

        delivery_session: true,
        category: true,

        distributor: {
          select: {
            id: true,
            name: true,
          },
        },

        master_product: {
          select: {
            id: true,
            code: true,

            master_brand: {
              select: {
                id: true,
                name: true,
              },
            },

            master_product_group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },

        master_vehicle: {
          select: {
            id: true,
            vehicle_number: true,
            vehicle_name: true,
          },
        },
      },
    });
  }

  async getDairyTrayData(paperId: number) {
    return this.prisma.dairy_tray_transaction.findMany({
      where: {
        dairy_tray_paper: {
          order_paper_id: paperId,
        },
      },
      select: {
        id: true,
        vehicle_id: true,
        tray_type_id: true,
        delivery_session: true,

        opening_balance: true,
        trays_taken: true,
        trays_returned: true,
        closing_balance: true,
        remarks: true,

        master_vehicle: {
          select: {
            id: true,
            vehicle_name: true,
            vehicle_number: true,
          },
        },

        master_tray_type: {
          select: {
            id: true,
            color: true,
            description: true,
            master_brand: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async getClientTrayData(paperId: number) {
    return this.prisma.client_tray_transaction.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },
      select: {
        client_id: true,
        tray_type_id: true,

        trays_taken: true,
        trays_returned: true,

        master_client: {
          select: {
            id: true,
            name: true,
          },
        },

        master_tray_type: {
          select: {
            id: true,
            color: true,
            description: true,
            master_brand: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async getDistributorTransferData(paperId: number) {
    return this.prisma.distributor_transfer.findMany({
      where: {
        order_paper_id: paperId,
      },
      select: {
        supplier_distributor_id: true,
        owner_distributor_id: true,
        billing_group_id: true,
        product_id: true,
        transfer_qty: true,

        supplier_distributor: {
          select: {
            id: true,
            name: true,
          },
        },

        owner_distributor: {
          select: {
            id: true,
            name: true,
          },
        },

        billing_group: {
          select: {
            id: true,
            name: true,
          },
        },

        master_product: {
          select: {
            id: true,
            code: true,

            master_brand: {
              select: {
                id: true,
                name: true,
              },
            },

            master_product_group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async getCashSettlementData(paperId: number) {
    return this.prisma.order_sheet.findMany({
      where: {
        order_paper_id: paperId,
      },
      select: {
        id: true,

        master_group: {
          select: {
            id: true,
            name: true,
          },
        },

        client_collection: {
          select: {
            cash_collection: true,
          },
        },

        cash_route_settlement: {
          select: {
            note_2000: true,
            note_500: true,
            note_200: true,
            note_100: true,
            note_50: true,
            note_20: true,
            note_10: true,
            coins: true,

            expenses: {
              select: {
                id: true,
                amount: true,
                remarks: true,

                expense_type: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async getDirectCollectionsData(paperId: number) {
    return this.prisma.cash_direct_collection.findMany({
      where: {
        order_paper_id: paperId,
      },
      select: {
        id: true,
        employee_id: true,

        note_2000: true,
        note_500: true,
        note_200: true,
        note_100: true,
        note_50: true,
        note_20: true,
        note_10: true,
        coins: true,

        remarks: true,

        employee: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async getBankDepositsData(paperId: number) {
    return this.prisma.cash_bank_deposit.findMany({
      where: {
        order_paper_id: paperId,
      },
      select: {
        id: true,
        bank_id: true,

        note_2000: true,
        note_500: true,
        note_200: true,
        note_100: true,
        note_50: true,
        note_20: true,
        note_10: true,
        coins: true,

        deposit_reference: true,
        remarks: true,

        bank: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async getPurchaseAllocationData(paperId: number) {
    return this.prisma.vehicle_allocation.findMany({
      where: {
        vehicle_allocation_paper: {
          order_paper_id: paperId,
        },
      },
      select: {
        vehicle_id: true,
        distributor_id: true,
        category: true,
        product_id: true,
        allocated_qty: true,

        vehicle_allocation_paper: {
          select: {
            delivery_session: true,
          },
        },
      },
    });
  }
}
