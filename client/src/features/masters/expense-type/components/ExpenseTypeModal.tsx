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
  CreateExpenseTypeRequest,
  ExpenseType,
  UpdateExpenseTypeRequest,
} from "../types/expense-types.types";

interface ExpenseTypeModalProps {
  open: boolean;
  expenseType: ExpenseType | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (
    data:
      | CreateExpenseTypeRequest
      | UpdateExpenseTypeRequest,
  ) => Promise<void>;
}

export function ExpenseTypeModal({
  open,
  expenseType,
  isSubmitting = false,
  onClose,
  onSubmit,
}: ExpenseTypeModalProps) {
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);

  const isEditing = expenseType !== null;

  useEffect(() => {
    if (expenseType) {
      setName(expenseType.name);
      setIsActive(expenseType.is_active);
    } else {
      setName("");
      setIsActive(true);
    }
  }, [expenseType, open]);

  const handleSubmit = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    await onSubmit({
      name: name.trim(),
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
              ? "Edit Expense Type"
              : "Add Expense Type"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="expense-type-name">
              Name{" "}
              <span className="text-destructive">
                *
              </span>
            </Label>

            <Input
              id="expense-type-name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              maxLength={100}
              required
              disabled={isSubmitting}
              placeholder="Enter expense type"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="expense-type-active">
                Active
              </Label>

              <p className="text-xs text-muted-foreground">
                Inactive expense types cannot be used as
                active master data.
              </p>
            </div>

            <Switch
              id="expense-type-active"
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
                  ? "Update Expense Type"
                  : "Create Expense Type"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}