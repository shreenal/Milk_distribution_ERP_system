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
  CreateEmployeeRequest,
  Employee,
  UpdateEmployeeRequest,
} from "../types/employees.types";

interface EmployeeModalProps {
  open: boolean;
  employee: Employee | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (
    data:
      | CreateEmployeeRequest
      | UpdateEmployeeRequest,
  ) => Promise<void>;
}

export function EmployeeModal({
  open,
  employee,
  isSubmitting = false,
  onClose,
  onSubmit,
}: EmployeeModalProps) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [isActive, setIsActive] = useState(true);

  const isEditing = employee !== null;

  useEffect(() => {
    if (employee) {
      setName(employee.name);
      setContact(employee.contact ?? "");
      setIsActive(employee.is_active);
    } else {
      setName("");
      setContact("");
      setIsActive(true);
    }
  }, [employee, open]);

  const handleSubmit = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    await onSubmit({
      name: name.trim(),
      contact: contact.trim() || null,
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
              ? "Edit Employee"
              : "Add Employee"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="employee-name">
              Name{" "}
              <span className="text-destructive">
                *
              </span>
            </Label>

            <Input
              id="employee-name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              maxLength={100}
              required
              disabled={isSubmitting}
              placeholder="Enter employee name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="employee-contact">
              Contact
            </Label>

            <Input
              id="employee-contact"
              value={contact}
              onChange={(event) =>
                setContact(event.target.value)
              }
              maxLength={20}
              disabled={isSubmitting}
              placeholder="Enter contact number"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="employee-active">
                Active
              </Label>

              <p className="text-xs text-muted-foreground">
                Inactive employees cannot be used as
                active master data.
              </p>
            </div>

            <Switch
              id="employee-active"
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
                  ? "Update Employee"
                  : "Create Employee"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}