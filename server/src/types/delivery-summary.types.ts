import { ProductColumnNode } from '../common/builders/product-columns.builder.js';
import { Prisma, SupplyCategory } from '../generated/prisma/client.js';

export type DeliveredItemWithSupplyContext = {
  billingGroupId: number;
  billingGroupName: string;
  productId: number;
  deliveredQty: number;
  distributorId: number;
  category: SupplyCategory;
  master_product: Product;
};

export type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export type SummaryRow = {
  groupId: number;
  groupName: string;
  [key: string]: string | number;
};

export type Summary = {
  summaryKey: string;
  distributorId: number;
  category: SupplyCategory;
  brandId: number;
  brandName: string;
  productGroupId: number;
  productGroupName: string;
  columns: ProductColumnNode[];
  rows: SummaryRow[];
};
