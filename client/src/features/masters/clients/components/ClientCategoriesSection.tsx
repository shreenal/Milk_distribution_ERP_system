import { Trash2 } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

import { MasterSection } from "../../shared/components/MasterSection";

import { useCreateClientCategory } from "../mutations/useCreateClientCategory";
import { useDeleteClientCategory } from "../mutations/useDeleteClientCategory";
import { useClientCategoriesByClient } from "../queries/useClientCategories";
import type { SupplyCategory } from "../types/client.types";
import { MasterTable, MasterTableActions, MasterTableCell, MasterTableRow } from "../../shared/components";

interface ClientCategoriesSectionProps {
  clientId: number;
  onClose: () => void;
}

const categories: SupplyCategory[] = [
  "MILK",
  "NON_MILK",
];

export function ClientCategoriesSection({
  clientId,
}: ClientCategoriesSectionProps) {
  const {
    data: clientCategories = [],
    isLoading,
    isError,
  } = useClientCategoriesByClient(clientId);

  const createCategory = useCreateClientCategory();
  const deleteCategory = useDeleteClientCategory();

  const hasCategory = (category: SupplyCategory) =>
    clientCategories.some(
      (item) => item.category === category,
    );

  const handleToggle = async (
    category: SupplyCategory,
  ) => {
    const existing = clientCategories.find(
      (item) => item.category === category,
    );

    if (existing) {
      await deleteCategory.mutateAsync({
        clientId,
        category,
      });

      return;
    }

    await createCategory.mutateAsync({
      client_id: clientId,
      category,
    });
  };

  if (isLoading) {
    return (
      <MasterSection title="Purchase Categories">
        <p className="text-sm text-muted-foreground">
          Loading categories...
        </p>
      </MasterSection>
    );
  }

  if (isError) {
    return (
      <MasterSection title="Purchase Categories">
        <p className="text-sm text-destructive">
          Failed to load client categories.
        </p>
      </MasterSection>
    );
  }

  return (
    <MasterSection
      title="Purchase Categories"
      description="Select the product categories this client is authorized to purchase."
    >
      <MasterTable
        headers={[
          { label: "Category" },
          { label: "Status" },
          {
            label: "Actions",
            align: "center",
            className: "w-[140px]",
          },
        ]}
        empty={categories.length === 0}
        emptyMessage="No purchase categories configured."
      >
        {categories.map((category) => {
          const selected = hasCategory(category);

          return (
            <MasterTableRow key={category}>
              <MasterTableCell className="font-medium">
                <Badge
                  variant={
                    selected
                      ? "default"
                      : "secondary"
                  }
                >
                  {category}
                </Badge>
              </MasterTableCell>

              <MasterTableCell>
                {selected
                  ? "Authorized"
                  : "Not authorized"}
              </MasterTableCell>

              <MasterTableActions>
                <Button
                  variant={
                    selected
                      ? "destructive"
                      : "outline"
                  }
                  size="sm"
                  onClick={() =>
                    handleToggle(category)
                  }
                  disabled={
                    createCategory.isPending ||
                    deleteCategory.isPending
                  }
                >
                  {selected ? (
                    <>
                      <Trash2 className="mr-2 size-4" />
                      Remove
                    </>
                  ) : (
                    "Add"
                  )}
                </Button>
              </MasterTableActions>
            </MasterTableRow>
          );
        })}
      </MasterTable>
    </MasterSection>
  );
}