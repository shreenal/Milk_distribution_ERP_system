import { useMemo, useState } from "react";


import { ProductTypesTable } from "../components/ProductTypesTable";
import { ProductTypeModal } from "../components/ProductTypeModal";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { MasterPageHeader } from "../../shared/components/MasterPageHeader";
import { MasterSearch } from "../../shared/components/MasterSearch";

import { useProductTypes } from "../queries/useProductTypes";

import { useCreateProductType } from "../mutations/useCreateProductType";
import { useUpdateProductType } from "../mutations/useUpdateProductType";
import { useDeleteProductType } from "../mutations/useDeleteProductType";

import { useBrandsActive } from "../../brands/queries/useBrands";

import type {
  CreateProductTypeRequest,
  UpdateProductTypeRequest,
} from "../types/product-types.types";

export default function ProductTypesPage() {
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProductTypeId, setEditingProductTypeId] =
    useState<number | null>(null);

  const {
    data: productTypes = [],
    isLoading: isProductTypesLoading,
    isError: isProductTypesError,
  } = useProductTypes();

  const {
    data: brands = [],
    isLoading: isBrandsLoading,
    isError: isBrandsError,
  } = useBrandsActive();

  const createProductType = useCreateProductType();
  const updateProductType = useUpdateProductType();
  const deleteProductType = useDeleteProductType();

  const editingProductType =
    productTypes.find(
      (productType) =>
        productType.id === editingProductTypeId,
    ) ?? null;

  const filteredProductTypes = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return productTypes;
    }

    return productTypes.filter((productType) =>
      [
        productType.name,
        productType.master_brand.name,
      ].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [productTypes, search]);

  const handleAdd = () => {
    setEditingProductTypeId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingProductTypeId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (
      createProductType.isPending ||
      updateProductType.isPending
    ) {
      return;
    }

    setIsModalOpen(false);
    setEditingProductTypeId(null);
  };

  const handleSubmit = async (
    data:
      | CreateProductTypeRequest
      | UpdateProductTypeRequest,
  ) => {
    if (editingProductTypeId === null) {
      await createProductType.mutateAsync(
        data as CreateProductTypeRequest,
      );
    } else {
      await updateProductType.mutateAsync({
        id: editingProductTypeId,
        data: data as UpdateProductTypeRequest,
      });
    }

    setIsModalOpen(false);
    setEditingProductTypeId(null);
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this product type?",
      )
    ) {
      return;
    }

    await deleteProductType.mutateAsync(id);
  };

  if (isProductTypesLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Loading product types...
      </div>
    );
  }

  if (isProductTypesError) {
    return (
      <div className="p-6 text-center text-destructive">
        Failed to load product types.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Product Types"
        description="Manage product type master records."
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Product Type
          </Button>
        }
      />

      <MasterSearch
        value={search}
        onChange={setSearch}
        placeholder="Search product types..."
      />

      <ProductTypesTable
        productTypes={filteredProductTypes}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <ProductTypeModal
        open={isModalOpen}
        onClose={handleCloseModal}
        productType={editingProductType}
        brands={brands}
        isSubmitting={
          createProductType.isPending ||
          updateProductType.isPending ||
          isBrandsLoading
        }
        onSubmit={handleSubmit}
      />

      {isBrandsError && isModalOpen && (
        <p className="text-sm text-destructive">
          Failed to load brands.
        </p>
      )}
    </div>
  );
}