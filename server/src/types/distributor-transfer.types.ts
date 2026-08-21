import { ProductColumnNode } from '../common/builders/product-columns.builder.js';
import { Prisma } from '../generated/prisma/client.js';

export type TransferSourceItem = Prisma.order_sheet_itemsGetPayload<{
  include: {
    order_sheet: {
      include: {
        master_group: {
          include: {
            supply_rules: {
              include: {
                distributor: true;
              };
            };
          };
        };
      };
    };
    master_client: {
      include: {
        owner_distributor: true;
      };
    };
    master_product: {
      include: {
        master_brand: true;
        master_product_group: true;
        master_product_type: true;
        master_packaging_type: true;
      };
    };
  };
}>;

export type TransferRow = {
  [key: string]: number;
};

export type TransferSummary = {
  supplierDistributor: {
    id: number;
    name: string;
  };

  ownerDistributor: {
    id: number;
    name: string;
  };

  brand: {
    id: number;
    name: string;
  };

  productGroup: {
    id: number;
    name: string;
  };

  rows: TransferRow[];
};

export type TransferGrid = TransferSummary & {
  columns: ProductColumnNode[];
};

type DistributorTransferRule = Prisma.distributor_transfer_ruleGetPayload<{}>;

export type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export type TransferSummaryBuilder = TransferSummary & {
  products: Product[];
};
