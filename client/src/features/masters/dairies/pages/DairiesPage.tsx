import { useState } from "react";

import { DairiesTable } from "../components/DairiesTable";
import { DairyModal } from "../components/DairyModal";

import { useDairies } from "../queries/useDairies";

import { useCreateDairy } from "../mutations/useCreateDairy";
import { useUpdateDairy } from "../mutations/useUpdateDairy";
import { useDeleteDairy } from "../mutations/useDeleteDairy";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { MasterPageHeader } from "../../shared/components/MasterPageHeader";

import type {
  CreateDairyRequest,
  UpdateDairyRequest,
} from "../types/dairies.types";

export default function DairiesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDairyId, setEditingDairyId] =
    useState<number | null>(null);

  const {
    data: dairies = [],
    isLoading,
    isError,
  } = useDairies();

  const createDairy = useCreateDairy();
  const updateDairy = useUpdateDairy();
  const deleteDairy = useDeleteDairy();

  const editingDairy =
    dairies.find(
      (dairy) => dairy.id === editingDairyId,
    ) ?? null;

  const handleAdd = () => {
    setEditingDairyId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingDairyId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (
      createDairy.isPending ||
      updateDairy.isPending
    ) {
      return;
    }

    setIsModalOpen(false);
    setEditingDairyId(null);
  };

  const handleSubmit = async (
    data: CreateDairyRequest | UpdateDairyRequest,
  ) => {
    if (editingDairyId === null) {
      await createDairy.mutateAsync(
        data as CreateDairyRequest,
      );
    } else {
      await updateDairy.mutateAsync({
        id: editingDairyId,
        data: data as UpdateDairyRequest,
      });
    }

    setIsModalOpen(false);
    setEditingDairyId(null);
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this dairy?",
      )
    ) {
      return;
    }

    await deleteDairy.mutateAsync(id);
  };

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
  title="Dairies"
  description="Manage dairy master data."
  action={
    <Button onClick={handleAdd}>
      <Plus className="mr-2 size-4" />
      Add Dairy
    </Button>
  }
/>

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          Loading dairies...
        </div>
      ) : isError ? (
        <div className="p-6 text-center text-destructive">
          Failed to load dairies.
        </div>
      ) : (
        <DairiesTable
          dairies={dairies}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isDeleting={deleteDairy.isPending}
        />
      )}

      <DairyModal
        open={isModalOpen}
        dairy={editingDairy}
        isSubmitting={
          createDairy.isPending ||
          updateDairy.isPending
        }
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}