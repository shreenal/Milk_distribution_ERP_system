import { Settings, Edit, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";
import { Badge } from "@/shared/components/ui/badge";

import { useDeleteProduct } from "../mutations/useDeleteProduct";
import type { Product } from "../types/products.types";

interface ProductsTableProps {
  products: Product[];
  onEdit: (id: number) => void;
  onViewConfiguration: (id: number) => void;
  onDelete: () => void;
}

export default function ProductsTable({
  products,
  onEdit,
  onViewConfiguration,
  onDelete,
}: ProductsTableProps) {
  const deleteProduct = useDeleteProduct();

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      await deleteProduct.mutateAsync(id);
      onDelete();
    }
  };

  return (
    <MasterTable
      headers={[
        { label: "Code" },
        { label: "Brand ID" },
        { label: "Product Group" },
        { label: "Packaging Size" },
        { label: "Unit" },
        { label: "GST %" },
        { label: "Default" },
        { label: "Display Order", align: "center" },
        { label: "Status" },
        {
          label: "Actions",
          align: "center",
          className: "w-[140px]",
        },
      ]}
      empty={products.length === 0}
      emptyMessage="No products found"
    >
      {products.map((product) => (
        <MasterTableRow key={product.id}>
          <MasterTableCell className="font-mono">
            {product.code}
          </MasterTableCell>

          <MasterTableCell>
            {product.brand_id}
          </MasterTableCell>

          <MasterTableCell>
            {product.product_group_id}
          </MasterTableCell>

          <MasterTableCell>
            {product.packaging_size}
          </MasterTableCell>

          <MasterTableCell>
            {product.packaging_unit}
          </MasterTableCell>

          <MasterTableCell>
            {product.gst_percentage}
            {product.is_gst_inclusive && "*"}
          </MasterTableCell>

          <MasterTableCell align="center">
            {product.show_by_default ? "Yes" : "No"}
          </MasterTableCell>

          <MasterTableCell align="center">
            {product.display_order ?? "—"}
          </MasterTableCell>

          <MasterTableCell>
            <Badge
              variant={
                product.is_active
                  ? "default"
                  : "secondary"
              }
            >
              {product.is_active ? "Active" : "Inactive"}
            </Badge>
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="View configuration"
              onClick={() =>
                onViewConfiguration(product.id)
              }
            >
              <Settings className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit product"
              onClick={() => onEdit(product.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete product"
              onClick={() => handleDelete(product.id)}
              disabled={deleteProduct.isPending}
            >
              <Trash2 className="size-4" />
            </Button>
          </MasterTableActions>
        </MasterTableRow>
      ))}
    </MasterTable>
  );
}