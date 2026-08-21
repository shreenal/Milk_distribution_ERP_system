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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

import { useActiveVehicles } from "../../vehicles/queries/useVehicles";

import type {
  CreateDriverRequest,
  Driver,
  UpdateDriverRequest,
} from "../types/drivers.types";

interface DriverModalProps {
  open: boolean;
  driver: Driver | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (
    data:
      | CreateDriverRequest
      | UpdateDriverRequest,
  ) => Promise<void>;
}

export function DriverModal({
  open,
  driver,
  isSubmitting = false,
  onClose,
  onSubmit,
}: DriverModalProps) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [vehicleId, setVehicleId] = useState<
    number | undefined
  >(undefined);
  const [isActive, setIsActive] = useState(true);

  const {
    data: vehicles = [],
    isLoading: isVehiclesLoading,
  } = useActiveVehicles();

  const isEditing = driver !== null;

  useEffect(() => {
    if (driver) {
      setName(driver.name);
      setContact(driver.contact ?? "");
      setVehicleId(driver.vehicle_id ?? undefined);
      setIsActive(driver.is_active);
    } else {
      setName("");
      setContact("");
      setVehicleId(undefined);
      setIsActive(true);
    }
  }, [driver, open]);

  const handleSubmit = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    await onSubmit({
      name: name.trim(),
      contact: contact.trim() || undefined,
      vehicle_id: vehicleId,
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
              ? "Edit Driver"
              : "Add Driver"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="driver-name">
              Name{" "}
              <span className="text-destructive">
                *
              </span>
            </Label>

            <Input
              id="driver-name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              maxLength={100}
              required
              disabled={isSubmitting}
              placeholder="Enter driver name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="driver-contact">
              Contact
            </Label>

            <Input
              id="driver-contact"
              value={contact}
              onChange={(event) =>
                setContact(event.target.value)
              }
              maxLength={20}
              disabled={isSubmitting}
              placeholder="Enter contact number"
            />
          </div>

          <div className="space-y-2">
            <Label>Vehicle</Label>

            <Select
              value={
                vehicleId?.toString() ?? "none"
              }
              onValueChange={(value) =>
                setVehicleId(
                  value === "none"
                    ? undefined
                    : Number(value),
                )
              }
              disabled={
                isSubmitting ||
                isVehiclesLoading
              }
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isVehiclesLoading
                      ? "Loading vehicles..."
                      : "Select vehicle"
                  }
                />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="none">
                  No vehicle
                </SelectItem>

                {vehicles.map((vehicle) => (
                  <SelectItem
                    key={vehicle.id}
                    value={vehicle.id.toString()}
                  >
                    {vehicle.vehicle_number}
                    {vehicle.vehicle_name
                      ? ` — ${vehicle.vehicle_name}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="driver-active">
                Active
              </Label>

              <p className="text-xs text-muted-foreground">
                Inactive drivers cannot be used as active
                master data.
              </p>
            </div>

            <Switch
              id="driver-active"
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
                isSubmitting || !name.trim()
              }
            >
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Update Driver"
                  : "Create Driver"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}