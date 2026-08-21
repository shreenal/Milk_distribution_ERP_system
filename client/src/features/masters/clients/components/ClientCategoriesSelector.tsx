import { useClientCategoriesByClient } from "../queries/useClientCategories";
import { useCreateClientCategory } from "../mutations/useCreateClientCategory";
import { useDeleteClientCategory } from "../mutations/useDeleteClientCategory";

import type { SupplyCategory } from "../types/client.types";

interface ClientCategoriesSelectorProps {
  clientId: number | null;
}

const categories: SupplyCategory[] = [
  "MILK",
  "NON_MILK",
];

export function ClientCategoriesSelector({
  clientId,
}: ClientCategoriesSelectorProps) {
  const {
    data: clientCategories = [],
    isLoading,
  } = useClientCategoriesByClient(clientId);

  const createCategory = useCreateClientCategory();
  const deleteCategory = useDeleteClientCategory();

  if (clientId === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Save the client before configuring purchase
        categories.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading categories...
      </p>
    );
  }

  const isSelected = (category: SupplyCategory) =>
    clientCategories.some(
      (item) => item.category === category,
    );

  const toggleCategory = async (
    category: SupplyCategory,
  ) => {
    if (isSelected(category)) {
      await deleteCategory.mutateAsync({
        clientId,
        category,
      });
    } else {
      await createCategory.mutateAsync({
        client_id: clientId,
        category,
      });
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        Purchase Categories
      </label>

      <div className="flex gap-2">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() =>
              toggleCategory(category)
            }
            disabled={
              createCategory.isPending ||
              deleteCategory.isPending
            }
            className={`rounded-md border px-3 py-2 text-sm ${
              isSelected(category)
                ? "bg-primary text-primary-foreground"
                : "bg-background"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        A client must be authorized for a product category
        before that category can be ordered.
      </p>
    </div>
  );
}