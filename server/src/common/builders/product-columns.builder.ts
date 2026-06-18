import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

type Product = Prisma.master_productGetPayload<{
  include: {
    master_brand: true;
    master_product_group: true;
    master_product_type: true;
    master_packaging_type: true;
  };
}>;

export type ProductColumnNode = {
  headerName: string;
  field?: string;
  productId?: number;
  editable?: boolean;
  children: ProductColumnNode[];
};

@Injectable()
export class ProductColumnsBuilder {
  buildGroupedColumns(
    products: Product[],
    mode: 'night' | 'morning',
    includePackagingType = true,
  ) {
    const brandMap = new Map<string, ProductColumnNode>();

    for (const product of products) {
      const brandName = product.master_brand?.name ?? 'Unknown Brand';

      const productGroupName =
        product.master_product_group?.name ?? 'Unknown Group';

      const productTypeName =
        product.master_product_type?.name ?? 'Unknown Type';

      const packagingTypeName =
        product.master_packaging_type?.name ?? 'Unknown Packaging';

      const sizeLabel = `${product.packaging_size}${product.packaging_unit}`;

      if (!brandMap.has(brandName)) {
        brandMap.set(brandName, {
          headerName: brandName,
          children: [],
        });
      }

      const brandGroup = brandMap.get(brandName);

      if (!brandGroup) {
        continue;
      }

      let productGroupNode = brandGroup.children.find(
        (child) => child.headerName === productGroupName,
      );

      if (!productGroupNode) {
        productGroupNode = {
          headerName: productGroupName,
          children: [],
        };

        brandGroup.children.push(productGroupNode);
      }

      let productTypeNode = productGroupNode.children.find(
        (child) => child.headerName === productTypeName,
      );

      if (!productTypeNode) {
        productTypeNode = {
          headerName: productTypeName,
          children: [],
        };

        productGroupNode.children.push(productTypeNode);
      }

      if (includePackagingType) {
        let packagingTypeNode = productTypeNode.children.find(
          (child) => child.headerName === packagingTypeName,
        );

        if (!packagingTypeNode) {
          packagingTypeNode = {
            headerName: packagingTypeName,
            children: [],
          };

          productTypeNode.children.push(packagingTypeNode);
        }

        packagingTypeNode.children.push({
          headerName: sizeLabel,

          field:
            mode === 'night'
              ? `product_${product.id}_ordered`
              : `product_${product.id}_delivered`,

          productId: product.id,

          editable: true,
          children: [],
        });
      } else {
        productTypeNode.children.push({
          headerName: sizeLabel,

          field:
            mode === 'night'
              ? `product_${product.id}_ordered`
              : `product_${product.id}_delivered`,

          productId: product.id,

          editable: true,
          children: [],
        });
      }
    }

    return Array.from(brandMap.values());
  }
}
