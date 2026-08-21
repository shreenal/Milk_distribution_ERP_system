import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

interface BrandsToolbarProps {
  onAdd: () => void;
}

export function BrandsToolbar({
  onAdd,
}: BrandsToolbarProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Brands</h1>
        <p className="text-sm text-muted-foreground">
          Manage product brands.
        </p>
      </div>

      <Button onClick={onAdd}>
        <Plus className="mr-2 size-4" />
        Add Brand
      </Button>
    </div>
  );
}