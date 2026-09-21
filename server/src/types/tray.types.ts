import { Prisma } from '../generated/prisma/client.js';

export type ProductTrayRule = Prisma.product_tray_ruleGetPayload<{
  include: {
    master_tray_type: {
      include: {
        master_brand: true;
      };
    };
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export interface TrayRuleProduct {
  brand_id: number | null;
  product_group_id: number | null;
  product_type_id: number | null;
  packaging_type_id: number | null;
}

export type TrayType = Prisma.master_tray_typeGetPayload<{
  include: {
    master_brand: true;
  };
}>;
