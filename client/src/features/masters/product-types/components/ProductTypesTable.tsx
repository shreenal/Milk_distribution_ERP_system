import { Edit, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type { ProductType } from "../types/product-types.types";

interface ProductTypesTableProps {
  productTypes: ProductType[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}

export function ProductTypesTable({
  productTypes,
  onEdit,
  onDelete,
}: ProductTypesTableProps) {
  return (
    <MasterTable
      headers={[
        { label: "Name" },
        { label: "Brand" },
        {
          label: "Actions",
          align: "center",
          className: "w-[140px]",
        },
      ]}
      empty={productTypes.length === 0}
      emptyMessage="No product types found"
    >
      {productTypes.map((productType) => (
        <MasterTableRow key={productType.id}>
          <MasterTableCell className="font-medium">
            {productType.name}
          </MasterTableCell>

          <MasterTableCell>
            {productType.master_brand.name}
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit product type"
              onClick={() => onEdit(productType.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete product type"
              onClick={() => onDelete(productType.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </MasterTableActions>
        </MasterTableRow>
      ))}
    </MasterTable>
  );
}