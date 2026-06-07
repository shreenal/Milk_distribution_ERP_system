import { Injectable } from '@nestjs/common';

@Injectable()
export class ProductColumnsBuilder {

    buildGroupedColumns(
        products: any[],
        mode: 'night' | 'morning',
        includePackagingType = true,
    ) {

        const brandMap = new Map();

        for (const product of products) {

            const brandName =
                product.master_brand?.name ??
                'Unknown Brand';

            const productGroupName =
                product.master_product_group?.name ??
                'Unknown Group';

            const productTypeName =
                product.master_product_type?.name ??
                'Unknown Type';

            const packagingTypeName =
                product.master_packaging_type?.name ??
                'Unknown Packaging';

            const sizeLabel =
                `${product.packaging_size}${product.packaging_unit}`;

            if (!brandMap.has(brandName)) {

                brandMap.set(
                    brandName,
                    {
                        headerName: brandName,
                        children: [],
                    },
                );
            }

            const brandGroup =
                brandMap.get(brandName);

            let productGroupNode =
                brandGroup.children.find(
                    child =>
                        child.headerName ===
                        productGroupName,
                );

            if (!productGroupNode) {

                productGroupNode = {
                    headerName: productGroupName,
                    children: [],
                };

                brandGroup.children.push(
                    productGroupNode,
                );
            }

            let productTypeNode =
                productGroupNode.children.find(
                    child =>
                        child.headerName ===
                        productTypeName,
                );

            if (!productTypeNode) {

                productTypeNode = {
                    headerName: productTypeName,
                    children: [],
                };

                productGroupNode.children.push(
                    productTypeNode,
                );
            }

            if (includePackagingType) {

    let packagingTypeNode =
        productTypeNode.children.find(
            child =>
                child.headerName ===
                packagingTypeName,
        );

    if (!packagingTypeNode) {

        packagingTypeNode = {
            headerName: packagingTypeName,
            children: [],
        };

        productTypeNode.children.push(
            packagingTypeNode,
        );
    }

    packagingTypeNode.children.push({

        headerName: sizeLabel,

        field:
            mode === 'night'
                ? `product_${product.id}_ordered`
                : `product_${product.id}_delivered`,

        productId:
            product.id,

        editable:
            true,
    });

} else {

    productTypeNode.children.push({

        headerName: sizeLabel,

        field:
            mode === 'night'
                ? `product_${product.id}_ordered`
                : `product_${product.id}_delivered`,

        productId:
            product.id,

        editable:
            true,
    });
}
        }

        return Array.from(
            brandMap.values(),
        );
    }
}