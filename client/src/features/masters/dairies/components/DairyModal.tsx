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
  CreateDairyRequest,
  Dairy,
  UpdateDairyRequest,
} from "../types/dairies.types";

interface DairyModalProps {
  open: boolean;
  dairy: Dairy | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (
    data: CreateDairyRequest | UpdateDairyRequest,
  ) => Promise<void>;
}

export function DairyModal({
  open,
  dairy,
  isSubmitting = false,
  onClose,
  onSubmit,
}: DairyModalProps) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [isActive, setIsActive] = useState(true);

  const isEditing = dairy !== null;

  useEffect(() => {
    if (dairy) {
      setName(dairy.name);
      setCity(dairy.city ?? "");
      setIsActive(dairy.is_active);
    } else {
      setName("");
      setCity("");
      setIsActive(true);
    }
  }, [dairy, open]);

  const handleSubmit = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    await onSubmit({
      name: name.trim(),
      city: city.trim() || null,
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
            {isEditing ? "Edit Dairy" : "Add Dairy"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="dairy-name">
              Name <span className="text-destructive">*</span>
            </Label>

            <Input
              id="dairy-name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              maxLength={100}
              required
              disabled={isSubmitting}
              placeholder="Enter dairy name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dairy-city">
              City
            </Label>

            <Input
              id="dairy-city"
              value={city}
              onChange={(event) =>
                setCity(event.target.value)
              }
              maxLength={100}
              disabled={isSubmitting}
              placeholder="Enter city"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="dairy-active">
                Active
              </Label>

              <p className="text-xs text-muted-foreground">
                Inactive dairies cannot be used as active
                master data.
              </p>
            </div>

            <Switch
              id="dairy-active"
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
                  ? "Update Dairy"
                  : "Create Dairy"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}