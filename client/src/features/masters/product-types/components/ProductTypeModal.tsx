import { useEffect, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";

import type { Brand } from "../../brands/types/brands.types";
import type {
  CreateProductTypeRequest,
  ProductType,
  UpdateProductTypeRequest,
} from "../types/product-types.types";

interface ProductTypeModalProps {
  open: boolean;
  onClose: () => void;
  productType?: ProductType | null;
  brands: Brand[];
  isSubmitting?: boolean;
  onSubmit: (
    data:
      | CreateProductTypeRequest
      | UpdateProductTypeRequest,
  ) => Promise<void>;
}

export function ProductTypeModal({
  open,
  onClose,
  productType,
  brands,
  isSubmitting = false,
  onSubmit,
}: ProductTypeModalProps) {
  const isEditing = Boolean(productType);

  const [brandId, setBrandId] = useState<number | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (productType) {
      setBrandId(productType.brand_id);
      setName(productType.name);
    } else {
      setBrandId(null);
      setName("");
    }
  }, [productType, open]);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!brandId || !name.trim()) {
      return;
    }

    if (isEditing) {
      const data: UpdateProductTypeRequest = {
        brand_id: brandId,
        name: name.trim(),
      };

      await onSubmit(data);
    } else {
      const data: CreateProductTypeRequest = {
        brand_id: brandId,
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
              ? "Edit Product Type"
              : "Add Product Type"}
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
              disabled={isSubmitting}
              required
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
              Name
            </label>

            <Input
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Enter product type name"
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
                !brandId ||
                !name.trim() ||
                isSubmitting
              }
            >
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Update Product Type"
                  : "Create Product Type"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}