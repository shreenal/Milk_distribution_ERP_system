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
  CreatePackagingTypeRequest,
  PackagingType,
  UpdatePackagingTypeRequest,
} from "../types/packaging-types.types";

interface PackagingTypeModalProps {
  open: boolean;
  onClose: () => void;
  packagingType?: PackagingType | null;
  isSubmitting?: boolean;
  onSubmit: (
    data:
      | CreatePackagingTypeRequest
      | UpdatePackagingTypeRequest,
  ) => Promise<void>;
}

export function PackagingTypeModal({
  open,
  onClose,
  packagingType,
  isSubmitting = false,
  onSubmit,
}: PackagingTypeModalProps) {
  const isEditing = Boolean(packagingType);

  const [name, setName] = useState("");

  useEffect(() => {
    if (packagingType) {
      setName(packagingType.name);
    } else {
      setName("");
    }
  }, [packagingType, open]);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    if (isEditing) {
      const data: UpdatePackagingTypeRequest = {
        name: name.trim(),
      };

      await onSubmit(data);
    } else {
      const data: CreatePackagingTypeRequest = {
        name: name.trim(),
      };

      await onSubmit(data);
    }
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
              ? "Edit Packaging Type"
              : "Add Packaging Type"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Name
            </label>

            <Input
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Enter packaging type name"
              maxLength={100}
              disabled={isSubmitting}
              required
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
                !name.trim() || isSubmitting
              }
            >
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Update Packaging Type"
                  : "Create Packaging Type"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}