import { useMemo, useState } from "react";

import { PackagingTypesTable } from "../components/PackagingTypesTable";
import { PackagingTypeModal } from "../components/PackagingTypeModal";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { MasterPageHeader } from "../../shared/components/MasterPageHeader";
import { MasterSearch } from "../../shared/components/MasterSearch";
import { usePackagingTypes } from "../queries/usePackagingTypes";

import { useCreatePackagingType } from "../mutations/useCreatePackagingType";
import { useUpdatePackagingType } from "../mutations/useUpdatePackagingType";
import { useDeletePackagingType } from "../mutations/useDeletePackagingType";

import type {
  CreatePackagingTypeRequest,
  UpdatePackagingTypeRequest,
} from "../types/packaging-types.types";

export default function PackagingTypesPage() {
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPackagingTypeId, setEditingPackagingTypeId] =
    useState<number | null>(null);

  const {
    data: packagingTypes = [],
    isLoading,
    isError,
  } = usePackagingTypes();

  const createPackagingType = useCreatePackagingType();
  const updatePackagingType = useUpdatePackagingType();
  const deletePackagingType = useDeletePackagingType();

  const editingPackagingType =
    packagingTypes.find(
      (packagingType) =>
        packagingType.id === editingPackagingTypeId,
    ) ?? null;

  const filteredPackagingTypes = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return packagingTypes;
    }

    return packagingTypes.filter((packagingType) =>
      packagingType.name.toLowerCase().includes(term),
    );
  }, [packagingTypes, search]);

  const handleAdd = () => {
    setEditingPackagingTypeId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingPackagingTypeId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (
      createPackagingType.isPending ||
      updatePackagingType.isPending
    ) {
      return;
    }

    setIsModalOpen(false);
    setEditingPackagingTypeId(null);
  };

  const handleSubmit = async (
    data:
      | CreatePackagingTypeRequest
      | UpdatePackagingTypeRequest,
  ) => {
    if (editingPackagingTypeId === null) {
      await createPackagingType.mutateAsync(
        data as CreatePackagingTypeRequest,
      );
    } else {
      await updatePackagingType.mutateAsync({
        id: editingPackagingTypeId,
        data: data as UpdatePackagingTypeRequest,
      });
    }

    setIsModalOpen(false);
    setEditingPackagingTypeId(null);
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this packaging type?",
      )
    ) {
      return;
    }

    await deletePackagingType.mutateAsync(id);
  };

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Packaging Types"
        description="Manage packaging type master records."
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Packaging Type
          </Button>
        }
      />

      <MasterSearch
        value={search}
        onChange={setSearch}
        placeholder="Search packaging types..."
      />

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          Loading packaging types...
        </div>
      ) : isError ? (
        <div className="p-6 text-center text-destructive">
          Failed to load packaging types.
        </div>
      ) : (
        <PackagingTypesTable
          packagingTypes={filteredPackagingTypes}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      <PackagingTypeModal
        open={isModalOpen}
        onClose={handleCloseModal}
        packagingType={editingPackagingType}
        isSubmitting={
          createPackagingType.isPending ||
          updatePackagingType.isPending
        }
        onSubmit={handleSubmit}
      />
    </div>
  );
}