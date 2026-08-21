import { useState } from "react";

import { DriversTable } from "../components/DriversTable";
import { DriverModal } from "../components/DriverModal";

import { useDrivers } from "../queries/useDrivers";

import { useCreateDriver } from "../mutations/useCreateDriver";
import { useUpdateDriver } from "../mutations/useUpdateDriver";
import { useDeleteDriver } from "../mutations/useDeleteDriver";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { MasterPageHeader } from "../../shared/components/MasterPageHeader";

import type {
  CreateDriverRequest,
  UpdateDriverRequest,
} from "../types/drivers.types";

export default function DriversPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriverId, setEditingDriverId] =
    useState<number | null>(null);

  const {
    data: drivers = [],
    isLoading,
    isError,
  } = useDrivers();

  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const deleteDriver = useDeleteDriver();

  const editingDriver =
    drivers.find(
      (driver) => driver.id === editingDriverId,
    ) ?? null;

  const handleAdd = () => {
    setEditingDriverId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingDriverId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (
      createDriver.isPending ||
      updateDriver.isPending
    ) {
      return;
    }

    setIsModalOpen(false);
    setEditingDriverId(null);
  };

  const handleSubmit = async (
    data: CreateDriverRequest | UpdateDriverRequest,
  ) => {
    if (editingDriverId === null) {
      await createDriver.mutateAsync(
        data as CreateDriverRequest,
      );
    } else {
      await updateDriver.mutateAsync({
        id: editingDriverId,
        data: data as UpdateDriverRequest,
      });
    }

    setIsModalOpen(false);
    setEditingDriverId(null);
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this driver?",
      )
    ) {
      return;
    }

    await deleteDriver.mutateAsync(id);
  };

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Drivers"
        description="Manage driver master data."
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Driver
          </Button>
        }
      />

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          Loading drivers...
        </div>
      ) : isError ? (
        <div className="p-6 text-center text-destructive">
          Failed to load drivers.
        </div>
      ) : (
        <DriversTable
          drivers={drivers}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isDeleting={deleteDriver.isPending}
        />
      )}

      <DriverModal
        open={isModalOpen}
        driver={editingDriver}
        isSubmitting={
          createDriver.isPending ||
          updateDriver.isPending
        }
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}