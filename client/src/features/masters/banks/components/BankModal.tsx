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
  Bank,
  CreateBankRequest,
  UpdateBankRequest,
} from "../types/banks.types";

interface BankModalProps {
  open: boolean;
  bank: Bank | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (
    data: CreateBankRequest | UpdateBankRequest,
  ) => Promise<void>;
}

export function BankModal({
  open,
  bank,
  isSubmitting = false,
  onClose,
  onSubmit,
}: BankModalProps) {
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);

  const isEditing = bank !== null;

  useEffect(() => {
    if (bank) {
      setName(bank.name);
      setIsActive(bank.is_active);
    } else {
      setName("");
      setIsActive(true);
    }
  }, [bank, open]);

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
            {isEditing ? "Edit Bank" : "Add Bank"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="bank-name">
              Name{" "}
              <span className="text-destructive">
                *
              </span>
            </Label>

            <Input
              id="bank-name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              maxLength={100}
              required
              disabled={isSubmitting}
              placeholder="Enter bank name"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="bank-active">
                Active
              </Label>

              <p className="text-xs text-muted-foreground">
                Inactive banks cannot be used as active
                master data.
              </p>
            </div>

            <Switch
              id="bank-active"
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
                  ? "Update Bank"
                  : "Create Bank"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}