import { useEffect, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";

import type {
  CreateGroupInput,
  DeliverySession,
  Group,
  UpdateGroupInput,
} from "../types/groups.types";

import { useCreateGroup } from "../mutations/useCreateGroup";
import { useUpdateGroup } from "../mutations/useUpdateGroup";
import { useActiveVehicles } from "../../vehicles/queries/useVehicles";

interface GroupModalProps {
  open: boolean;
  onClose: () => void;
  group?: Group | null;
}

export function GroupModal({
  open,
  onClose,
  group,
}: GroupModalProps) {
  const isEditing = Boolean(group);

  const [name, setName] = useState("");
  const [deliverySession, setDeliverySession] =
    useState<DeliverySession>("NIGHT");
  const [vehicleId, setVehicleId] = useState<number | null>(
    null,
  );
  const [isActive, setIsActive] = useState(true);

  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const {
    data: vehicles = [],
    isLoading: isVehiclesLoading,
  } = useActiveVehicles();

  useEffect(() => {
    if (group) {
      setName(group.name);
      setDeliverySession(group.delivery_session);
      setVehicleId(group.vehicle_id ?? null);
      setIsActive(group.is_active);
    } else {
      setName("");
      setDeliverySession("NIGHT");
      setVehicleId(null);
      setIsActive(true);
    }
  }, [group, open]);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    if (isEditing && group) {
      const data: UpdateGroupInput = {
        name: name.trim(),
        delivery_session: deliverySession,
        vehicle_id: vehicleId,
        is_active: isActive,
      };

      await updateGroup.mutateAsync({
        id: group.id,
        data,
      });
    } else {
      const data: CreateGroupInput = {
        name: name.trim(),
        delivery_session: deliverySession,
        vehicle_id: vehicleId,
        is_active: isActive,
      };

      await createGroup.mutateAsync(data);
    }

    onClose();
  };

  const isPending =
    createGroup.isPending || updateGroup.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Group" : "Add Group"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Group Name
            </label>

            <Input
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="e.g. Group 1"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Delivery Session
            </label>

            <select
              value={deliverySession}
              onChange={(event) =>
                setDeliverySession(
                  event.target.value as DeliverySession,
                )
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="NIGHT">Night</option>
              <option value="MORNING">Morning</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Vehicle
            </label>

            <select
              value={vehicleId ?? ""}
              onChange={(event) =>
                setVehicleId(
                  event.target.value
                    ? Number(event.target.value)
                    : null,
                )
              }
              disabled={isVehiclesLoading || isPending}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">
                {isVehiclesLoading
                  ? "Loading vehicles..."
                  : "No vehicle assigned"}
              </option>

              {vehicles.map((vehicle) => (
                <option
                  key={vehicle.id}
                  value={vehicle.id}
                >
                  {vehicle.vehicle_number}
                  {vehicle.vehicle_name
                    ? ` — ${vehicle.vehicle_name}`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) =>
                setIsActive(event.target.checked)
              }
            />

            Active
          </label>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={!name.trim() || isPending}
            >
              {isPending
                ? "Saving..."
                : isEditing
                  ? "Update Group"
                  : "Create Group"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}