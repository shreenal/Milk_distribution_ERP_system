import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";

import type {
  CreateVehicleRequest,
  UpdateVehicleRequest,
  Vehicle,
} from "../types/vehicles.types";

interface VehicleModalProps {
  open: boolean;
  vehicle: Vehicle | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (
    data: CreateVehicleRequest | UpdateVehicleRequest,
  ) => Promise<void>;
}

export function VehicleModal({
  open,
  vehicle,
  isSubmitting = false,
  onClose,
  onSubmit,
}: VehicleModalProps) {
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleName, setVehicleName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isActive, setIsActive] = useState(true);

  const isEditing = vehicle !== null;

  useEffect(() => {
    if (vehicle) {
      setVehicleNumber(vehicle.vehicle_number);
      setVehicleName(vehicle.vehicle_name ?? "");
      setCapacity(
        vehicle.capacity !== null
          ? String(vehicle.capacity)
          : "",
      );
      setIsActive(vehicle.is_active);
    } else {
      setVehicleNumber("");
      setVehicleName("");
      setCapacity("");
      setIsActive(true);
    }
  }, [vehicle, open]);

  const handleSubmit = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!vehicleNumber.trim()) {
      return;
    }

    await onSubmit({
      vehicle_number: vehicleNumber.trim(),
      vehicle_name: vehicleName.trim() || null,
      capacity: capacity
        ? Number(capacity)
        : undefined,
      is_active: isActive,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !isSubmitting) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? "Edit Vehicle"
              : "Add Vehicle"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="vehicle-number">
              Vehicle Number{" "}
              <span className="text-destructive">*</span>
            </Label>

            <Input
              id="vehicle-number"
              value={vehicleNumber}
              onChange={(event) =>
                setVehicleNumber(event.target.value)
              }
              maxLength={20}
              required
              disabled={isSubmitting}
              placeholder="Enter vehicle number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vehicle-name">
              Vehicle Name
            </Label>

            <Input
              id="vehicle-name"
              value={vehicleName}
              onChange={(event) =>
                setVehicleName(event.target.value)
              }
              maxLength={100}
              disabled={isSubmitting}
              placeholder="Enter vehicle name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vehicle-capacity">
              Capacity
            </Label>

            <Input
              id="vehicle-capacity"
              type="number"
              min={0}
              step={1}
              value={capacity}
              onChange={(event) =>
                setCapacity(event.target.value)
              }
              disabled={isSubmitting}
              placeholder="Enter capacity"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="vehicle-active">
                Active
              </Label>

              <p className="text-xs text-muted-foreground">
                Inactive vehicles cannot be selected as
                active master data.
              </p>
            </div>

            <Switch
              id="vehicle-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !vehicleNumber.trim()
              }
            >
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Update Vehicle"
                  : "Create Vehicle"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}