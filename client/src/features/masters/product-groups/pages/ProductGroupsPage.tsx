import { useMemo, useState } from "react";

import { ProductGroupsTable } from "../components/ProductGroupsTable";
import { ProductGroupModal } from "../components/ProductGroupModal";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import { MasterPageHeader } from "../../shared/components/MasterPageHeader";
import { MasterSearch } from "../../shared/components/MasterSearch";

import { useProductGroups } from "../queries/useProductGroups";

import { useCreateProductGroup } from "../mutations/useCreateProductGroup";
import { useUpdateProductGroup } from "../mutations/useUpdateProductGroup";
import { useDeleteProductGroup } from "../mutations/useDeleteProductGroup";

import type {
  CreateProductGroupRequest,
  UpdateProductGroupRequest,
} from "../types/product-groups.types";

export default function ProductGroupsPage() {
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProductGroupId, setEditingProductGroupId] =
    useState<number | null>(null);

  const {
    data: productGroups = [],
    isLoading,
    isError,
  } = useProductGroups();

  const createProductGroup = useCreateProductGroup();
  const updateProductGroup = useUpdateProductGroup();
  const deleteProductGroup = useDeleteProductGroup();

  const filteredProductGroups = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return productGroups;
    }

    return productGroups.filter((productGroup) =>
      [
        productGroup.name,
        productGroup.category,
      ].some((value) =>
        String(value).toLowerCase().includes(term),
      ),
    );
  }, [productGroups, search]);

  const editingProductGroup =
    productGroups.find(
      (productGroup) =>
        productGroup.id === editingProductGroupId,
    ) ?? null;

  const handleAdd = () => {
    setEditingProductGroupId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingProductGroupId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (
      createProductGroup.isPending ||
      updateProductGroup.isPending
    ) {
      return;
    }

    setIsModalOpen(false);
    setEditingProductGroupId(null);
  };

  const handleSubmit = async (
    data:
      | CreateProductGroupRequest
      | UpdateProductGroupRequest,
  ) => {
    if (editingProductGroupId === null) {
      await createProductGroup.mutateAsync(
        data as CreateProductGroupRequest,
      );
    } else {
      await updateProductGroup.mutateAsync({
        id: editingProductGroupId,
        data: data as UpdateProductGroupRequest,
      });
    }

    setIsModalOpen(false);
    setEditingProductGroupId(null);
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this product group?",
      )
    ) {
      return;
    }

    await deleteProductGroup.mutateAsync(id);
  };

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Product Groups"
        description="Manage product group master records."
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Product Group
          </Button>
        }
      />

      <MasterSearch
        value={search}
        onChange={setSearch}
        placeholder="Search product groups..."
      />

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          Loading product groups...
        </div>
      ) : isError ? (
        <div className="p-6 text-center text-destructive">
          Failed to load product groups.
        </div>
      ) : (
        <ProductGroupsTable
          productGroups={filteredProductGroups}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      <ProductGroupModal
        open={isModalOpen}
        onClose={handleCloseModal}
        productGroup={editingProductGroup}
      />
    </div>
  );
}