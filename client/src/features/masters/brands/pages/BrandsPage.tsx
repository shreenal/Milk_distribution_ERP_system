import { useState } from "react";

import { BrandsTable } from "../components/BrandsTable";
import { BrandModal } from "../components/BrandModal";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { MasterPageHeader } from "../../shared/components/MasterPageHeader";
import { useBrands } from "../queries/useBrands";

export default function BrandsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrandId, setEditingBrandId] = useState<number | null>(null);

  const {
    data: brands = [],
    isLoading,
    isError,
  } = useBrands();

  const editingBrand =
    brands.find((brand) => brand.id === editingBrandId) ?? null;

  const handleAdd = () => {
    setEditingBrandId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingBrandId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBrandId(null);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Loading brands...
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <p className="text-destructive">
          Failed to load brands.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Brands"
        description="Manage brand master data."
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Brand
          </Button>
        }
      />

      <BrandsTable
        brands={brands}
        onEdit={handleEdit}
      />

      <BrandModal
        open={isModalOpen}
        onClose={handleCloseModal}
        brand={editingBrand}
      />
    </div>
  );
}