import { useEffect, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

import {
  useCreateProductGroup,
} from "../mutations/useCreateProductGroup";
import {
  useUpdateProductGroup,
} from "../mutations/useUpdateProductGroup";

import type {
  ProductGroup,
  SupplyCategory,
} from "../types/product-groups.types";

interface ProductGroupModalProps {
  open: boolean;
  onClose: () => void;
  productGroup?: ProductGroup | null;
}

export function ProductGroupModal({
  open,
  onClose,
  productGroup,
}: ProductGroupModalProps) {
  const isEditing = Boolean(productGroup);

  const [name, setName] = useState("");
  const [category, setCategory] =
    useState<SupplyCategory | "">("");

  const createProductGroup = useCreateProductGroup();
  const updateProductGroup = useUpdateProductGroup();

  useEffect(() => {
    if (productGroup) {
      setName(productGroup.name);
      setCategory(productGroup.category);
    } else {
      setName("");
      setCategory("");
    }
  }, [productGroup, open]);

  const isPending =
    createProductGroup.isPending ||
    updateProductGroup.isPending;

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!name.trim() || !category) {
      return;
    }

    if (isEditing && productGroup) {
      await updateProductGroup.mutateAsync({
        id: productGroup.id,
        data: {
          name: name.trim(),
          category,
        },
      });
    } else {
      await createProductGroup.mutateAsync({
        name: name.trim(),
        category,
      });
    }

    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !isPending) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? "Edit Product Group"
              : "Add Product Group"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="product-group-name">
              Name
            </Label>

            <Input
              id="product-group-name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="e.g. Full Cream Milk"
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>
              Supply Category
            </Label>

            <Select
              value={category}
              onValueChange={(value) =>
                setCategory(value as SupplyCategory)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="MILK">
                  MILK
                </SelectItem>

                <SelectItem value="NON_MILK">
                  NON_MILK
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={
                !name.trim() ||
                !category ||
                isPending
              }
            >
              {isPending
                ? "Saving..."
                : isEditing
                  ? "Update Product Group"
                  : "Create Product Group"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}