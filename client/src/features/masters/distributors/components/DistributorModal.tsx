import { useEffect, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

import { useCreateDistributor } from "../mutations/useCreateDistributor";
import { useUpdateDistributor } from "../mutations/useUpdateDistributor";
import { useDistributorById } from "../queries/useDistributors";

interface DistributorModalProps {
  open: boolean;
  distributorId: number | null;
  onOpenChange: (open: boolean) => void;
}

export function DistributorModal({
  open,
  distributorId,
  onOpenChange,
}: DistributorModalProps) {
  const isEditing = distributorId !== null;

  const { data: distributor, isLoading } =
    useDistributorById(distributorId);

  const createDistributor = useCreateDistributor();
  const updateDistributor = useUpdateDistributor(distributorId);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (distributorId === null) {
      setName("");
      setContact("");
      setEmail("");
      setIsActive(true);
      return;
    }

    if (distributor) {
      setName(distributor.name);
      setContact(distributor.contact ?? "");
      setEmail(distributor.email ?? "");
      setIsActive(distributor.is_active);
    }
  }, [open, distributorId, distributor]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    if (isEditing) {
      await updateDistributor.mutateAsync({
        name: name.trim(),
        contact: contact.trim() || null,
        email: email.trim() || null,
        is_active: isActive,
      });
    } else {
      await createDistributor.mutateAsync({
        name: name.trim(),
        contact: contact.trim() || null,
        email: email.trim() || null,
        is_active: isActive,
      });
    }

    onOpenChange(false);
  };

  const isPending =
    createDistributor.isPending ||
    updateDistributor.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing
                ? "Edit Distributor"
                : "Add Distributor"}
            </DialogTitle>
          </DialogHeader>

          {isEditing && isLoading ? (
            <div className="py-6 text-center text-muted-foreground">
              Loading distributor...
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="distributor-name">
                  Name
                </Label>

                <Input
                  id="distributor-name"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="Distributor name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="distributor-contact">
                  Contact
                </Label>

                <Input
                  id="distributor-contact"
                  value={contact}
                  onChange={(event) =>
                    setContact(event.target.value)
                  }
                  placeholder="Contact number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="distributor-email">
                  Email
                </Label>

                <Input
                  id="distributor-email"
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="Email address"
                />
              </div>

              {isEditing && (
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
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={
                isPending ||
                (isEditing && isLoading)
              }
            >
              {isPending
                ? "Saving..."
                : isEditing
                  ? "Update Distributor"
                  : "Create Distributor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}