import { useEffect, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { useActiveDairies } from "../../dairies/queries/useDairies";

import type {
  Brand,
  CreateBrandInput,
  GatepassDatePolicy,
  UpdateBrandInput,
} from "../types/brands.types";

import { useCreateBrand } from "../mutations/useCreateBrand";
import { useUpdateBrand } from "../mutations/useUpdateBrand";

interface BrandModalProps {
  open: boolean;
  onClose: () => void;
  brand?: Brand | null;
}

export function BrandModal({
  open,
  onClose,
  brand,
}: BrandModalProps) {
  const isEditing = Boolean(brand);

  const [name, setName] = useState("");
  const [dairyId, setDairyId] = useState<number | null>(null);
  const [gatepassDatePolicy, setGatepassDatePolicy] =
    useState<GatepassDatePolicy>("SAME_DAY");
  const [isActive, setIsActive] = useState(true);

  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const {
    data: dairies = [],
    isLoading: isDairiesLoading,
  } = useActiveDairies();

  useEffect(() => {
    if (brand) {
      setName(brand.name);
      setDairyId(brand.dairy_id);
      setGatepassDatePolicy(
        brand.gatepass_date_policy,
      );
      setIsActive(brand.is_active);
    } else {
      setName("");
      setDairyId(null);
      setGatepassDatePolicy("SAME_DAY");
      setIsActive(true);
    }
  }, [brand, open]);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!name.trim() || !dairyId) {
      return;
    }

    if (isEditing && brand) {
      const data: UpdateBrandInput = {
        name: name.trim(),
        dairy_id: dairyId,
        gatepass_date_policy: gatepassDatePolicy,
        is_active: isActive,
      };

      await updateBrand.mutateAsync({
        id: brand.id,
        data,
      });
    } else {
      const data: CreateBrandInput = {
        name: name.trim(),
        dairy_id: dairyId,
        gatepass_date_policy: gatepassDatePolicy,
        is_active: isActive,
      };

      await createBrand.mutateAsync(data);
    }

    onClose();
  };

  const isPending =
    createBrand.isPending || updateBrand.isPending;

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
            {isEditing ? "Edit Brand" : "Add Brand"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Brand Name
            </label>

            <Input
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="e.g. Amul"
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Dairy
            </label>

            <select
              value={dairyId ?? ""}
              onChange={(event) =>
                setDairyId(
                  event.target.value
                    ? Number(event.target.value)
                    : null,
                )
              }
              disabled={isDairiesLoading || isPending}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">
                {isDairiesLoading
                  ? "Loading dairies..."
                  : "Select dairy"}
              </option>

              {dairies.map((dairy) => (
                <option
                  key={dairy.id}
                  value={dairy.id}
                >
                  {dairy.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Gatepass Date Policy
            </label>

            <select
              value={gatepassDatePolicy}
              onChange={(event) =>
                setGatepassDatePolicy(
                  event.target.value as GatepassDatePolicy,
                )
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="SAME_DAY">
                Same Day
              </option>
              <option value="NEXT_DAY">
                Next Day
              </option>
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
              disabled={
                !name.trim() ||
                !dairyId ||
                isPending
              }
            >
              {isPending
                ? "Saving..."
                : isEditing
                  ? "Update Brand"
                  : "Create Brand"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}