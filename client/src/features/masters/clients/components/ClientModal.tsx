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
  Client,
  CreateClientRequest,
  UpdateClientRequest,
} from "../types/client.types";

interface SelectorOption {
  id: number;
  name: string;
}

interface ClientModalProps {
  open: boolean;
  client: Client | null;

  groups: SelectorOption[];
  distributors: SelectorOption[];

  isSubmitting?: boolean;

  onClose: () => void;
  onSubmit: (
    data: CreateClientRequest | UpdateClientRequest
  ) => void;
}

export function ClientModal({
  open,
  client,
  groups,
  distributors,
  isSubmitting = false,
  onClose,
  onSubmit,
}: ClientModalProps) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [shopName, setShopName] = useState("");
  const [deliveryGroupId, setDeliveryGroupId] = useState("");
  const [ownerDistributorId, setOwnerDistributorId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const isEditing = client !== null;

  useEffect(() => {
    if (client) {
      setName(client.name);
      setContact(client.contact ?? "");
      setShopName(client.shop_name ?? "");
      setDeliveryGroupId(String(client.delivery_group_id));
      setOwnerDistributorId(
        String(client.owner_distributor_id)
      );
      setIsActive(client.is_active);
    } else {
      setName("");
      setContact("");
      setShopName("");
      setDeliveryGroupId("");
      setOwnerDistributorId("");
      setIsActive(true);
    }
  }, [client, open]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (
      !name.trim() ||
      !deliveryGroupId ||
      !ownerDistributorId
    ) {
      return;
    }

    onSubmit({
      name: name.trim(),
      contact: contact.trim() || undefined,
      shop_name: shopName.trim() || undefined,
      delivery_group_id: Number(deliveryGroupId),
      owner_distributor_id: Number(ownerDistributorId),
      is_active: isActive,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (!value) {
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Client" : "Add Client"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Client Name
            </label>

            <Input
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Enter client name"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Shop Name
            </label>

            <Input
              value={shopName}
              onChange={(event) =>
                setShopName(event.target.value)
              }
              placeholder="Enter shop name"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Contact
            </label>

            <Input
              value={contact}
              onChange={(event) =>
                setContact(event.target.value)
              }
              placeholder="Enter contact"
            />
          </div>

          <div className="space-y-2">

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Delivery Group
              </label>

              <select
                value={deliveryGroupId}
                onChange={(event) =>
                  setDeliveryGroupId(event.target.value)
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                required
              >
                <option value="">
                  Select delivery group
                </option>

                {groups.map((group) => (
                  <option
                    key={group.id}
                    value={group.id}
                  >
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Owner Distributor
            </label>

            <select
              value={ownerDistributorId}
              onChange={(event) =>
                setOwnerDistributorId(event.target.value)
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              required
            >
              <option value="">
                Select distributor
              </option>

              {distributors.map((distributor) => (
                <option
                  key={distributor.id}
                  value={distributor.id}
                >
                  {distributor.name}
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

          <div className="flex justify-end gap-2 pt-2">
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
                !name.trim() ||
                !deliveryGroupId ||
                !ownerDistributorId
              }
            >
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Create Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}