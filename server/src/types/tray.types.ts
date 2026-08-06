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

export type TrayRuleProduct = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export type TrayType = Prisma.master_tray_typeGetPayload<{
  include: {
    master_brand: true;
  };
}>;
