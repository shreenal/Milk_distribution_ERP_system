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
  CreateTrayTypeInput,
  TrayType,
  TrayBrand,
  UpdateTrayTypeInput,
} from "../types/trays.types";

import { useCreateTray } from "../mutations/useCreateTray";
import { useUpdateTray } from "../mutations/useUpdateTray";



interface TrayModalProps {
  open: boolean;
  onClose: () => void;
  tray: TrayType | null;
  brands: TrayBrand[];
}

export function TrayModal({
  open,
  onClose,
  tray,
  brands,
}: TrayModalProps) {
  const isEditing = Boolean(tray);

  const [brandId, setBrandId] = useState<number | null>(null);
  const [color, setColor] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  const createTray = useCreateTray();
  const updateTray = useUpdateTray();

  useEffect(() => {
    if (tray) {
      setBrandId(tray.brand_id);
      setColor(tray.color);
      setDescription(tray.description ?? "");
      setIsActive(tray.is_active);
    } else {
      setBrandId(null);
      setColor("");
      setDescription("");
      setIsActive(true);
    }
  }, [tray, open]);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!brandId || !color.trim()) {
      return;
    }

    if (isEditing && tray) {
      const data: UpdateTrayTypeInput = {
        brand_id: brandId,
        color: color.trim(),
        description: description.trim() || undefined,
        is_active: isActive,
      };

      await updateTray.mutateAsync({
        id: tray.id,
        data,
      });
    } else {
      const data: CreateTrayTypeInput = {
        brand_id: brandId,
        color: color.trim(),
        description: description.trim() || undefined,
        is_active: isActive,
      };

      await createTray.mutateAsync(data);
    }

    onClose();
  };

  const isPending =
    createTray.isPending || updateTray.isPending;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Tray Type" : "Add Tray Type"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Brand
            </label>

            <select
              value={brandId ?? ""}
              onChange={(event) =>
                setBrandId(
                  event.target.value
                    ? Number(event.target.value)
                    : null,
                )
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">
                Select brand
              </option>

              {brands.map((brand) => (
                <option
                  key={brand.id}
                  value={brand.id}
                >
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Color
            </label>

            <Input
              value={color}
              onChange={(event) =>
                setColor(event.target.value)
              }
              placeholder="e.g. Blue"
              maxLength={50}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Description
            </label>

            <Input
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Optional description"
              maxLength={255}
            />
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
              disabled={
                !brandId ||
                !color.trim() ||
                isPending
              }
            >
              {isPending
                ? "Saving..."
                : isEditing
                  ? "Update Tray Type"
                  : "Create Tray Type"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}