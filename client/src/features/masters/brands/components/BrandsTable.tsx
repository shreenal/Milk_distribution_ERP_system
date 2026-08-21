import { Edit, Trash2 } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import { useDeleteBrand } from "../mutations/useDeleteBrand";
import type { Brand } from "../types/brands.types";

interface BrandsTableProps {
  brands: Brand[];
  onEdit: (id: number) => void;
}

export function BrandsTable({
  brands,
  onEdit,
}: BrandsTableProps) {
  const deleteBrand = useDeleteBrand();

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this brand?",
      )
    ) {
      return;
    }

    await deleteBrand.mutateAsync(id);
  };

  return (
    <MasterTable
      headers={[
        {
          label: "Name",
        },
        {
          label: "Dairy",
        },
        {
          label: "Gatepass Policy",
        },
        {
          label: "Status",
          align: "center",
        },
        {
          label: "Actions",
          align: "center",
          className: "w-[140px]",
        },
      ]}
      empty={brands.length === 0}
      emptyMessage="No brands found"
    >
      {brands.map((brand) => (
        <MasterTableRow key={brand.id}>
          <MasterTableCell className="font-medium">
            {brand.name}
          </MasterTableCell>

          <MasterTableCell>
            {brand.master_dairy?.name ?? brand.dairy_id}
          </MasterTableCell>

          <MasterTableCell>
            {brand.gatepass_date_policy}
          </MasterTableCell>

          <MasterTableCell align="center">
            <Badge
              variant={
                brand.is_active
                  ? "default"
                  : "secondary"
              }
            >
              {brand.is_active
                ? "Active"
                : "Inactive"}
            </Badge>
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit brand"
              onClick={() => onEdit(brand.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete brand"
              onClick={() => handleDelete(brand.id)}
              disabled={deleteBrand.isPending}
            >
              <Trash2 className="size-4" />
            </Button>
          </MasterTableActions>
        </MasterTableRow>
      ))}
    </MasterTable>
  );
}