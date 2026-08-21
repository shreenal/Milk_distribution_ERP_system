import { useState } from "react";

import { VehiclesTable } from "../components/VehiclesTable";
import { VehicleModal } from "../components/VehicleModal";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { MasterPageHeader } from "../../shared/components/MasterPageHeader";
import { useVehicles } from "../queries/useVehicles";

import { useCreateVehicle } from "../mutations/useCreateVehicle";
import { useUpdateVehicle } from "../mutations/useUpdateVehicle";
import { useDeleteVehicle } from "../mutations/useDeleteVehicle";

import type {
  CreateVehicleRequest,
  UpdateVehicleRequest,
} from "../types/vehicles.types";

export default function VehiclesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] =
    useState<number | null>(null);

  const {
    data: vehicles = [],
    isLoading,
    isError,
  } = useVehicles();

  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();

  const editingVehicle =
    vehicles.find(
      (vehicle) => vehicle.id === editingVehicleId,
    ) ?? null;

  const handleAdd = () => {
    setEditingVehicleId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingVehicleId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (
      createVehicle.isPending ||
      updateVehicle.isPending
    ) {
      return;
    }

    setIsModalOpen(false);
    setEditingVehicleId(null);
  };

  const handleSubmit = async (
    data: CreateVehicleRequest | UpdateVehicleRequest,
  ) => {
    if (editingVehicleId === null) {
      await createVehicle.mutateAsync(
        data as CreateVehicleRequest,
      );
    } else {
      await updateVehicle.mutateAsync({
        id: editingVehicleId,
        data: data as UpdateVehicleRequest,
      });
    }

    setIsModalOpen(false);
    setEditingVehicleId(null);
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this vehicle?",
      )
    ) {
      return;
    }

    await deleteVehicle.mutateAsync(id);
  };

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Vehicles"
        description="Manage vehicle master data."
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Vehicle
          </Button>
        }
      />

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          Loading vehicles...
        </div>
      ) : isError ? (
        <div className="p-6 text-center text-destructive">
          Failed to load vehicles.
        </div>
      ) : (
        <VehiclesTable
          vehicles={vehicles}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isDeleting={deleteVehicle.isPending}
        />
      )}

      <VehicleModal
        open={isModalOpen}
        vehicle={editingVehicle}
        isSubmitting={
          createVehicle.isPending ||
          updateVehicle.isPending
        }
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}