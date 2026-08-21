import { Edit, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

import type { ProductLink } from "../types/products.types";

import { useDeleteDistributorProductRate } from "../mutations/useDeleteDistributorProductRate";
import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
  MasterSection,
} from "../../shared/components";
import {
  formatDateForDisplay,
  isRateCurrent,
  isRateExpired,
} from "../helpers/configuration.helper";

import { useCreateDistributorProductRate } from "../mutations/useCreateDistributorProductRate";
import { useUpdateDistributorProductRate } from "../mutations/useUpdateDistributorProductRate";
import { useState } from "react";

interface DistributorRatesTableProps {
  productId: number;
  productLinks: ProductLink[];
}

export default function DistributorRatesTable({
  productId,
  productLinks,
}: DistributorRatesTableProps) {

  const [isAdding, setIsAdding] = useState(false);
  const [editingRateId, setEditingRateId] =
    useState<number | null>(null);

  const [productLinkId, setProductLinkId] =
    useState<number | null>(null);

  const [purchaseRate, setPurchaseRate] = useState("");
  const [sellingRate, setSellingRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [isActive, setIsActive] = useState(true);

  const createDistributorProductRate =
    useCreateDistributorProductRate(productId);

  const updateDistributorProductRate =
    useUpdateDistributorProductRate(productId);
  const deleteDistributorProductRate =
    useDeleteDistributorProductRate(productId);

  const allDistributorRates = productLinks.flatMap((link) =>
    link.distributor_rates.map((rate) => ({
      ...rate,
      distributorName: link.distributor.name,
      link,
    })),
  );

  const resetForm = () => {
    setIsAdding(false);
    setEditingRateId(null);
    setProductLinkId(null);
    setPurchaseRate("");
    setSellingRate("");
    setEffectiveFrom("");
    setEffectiveTo("");
    setIsActive(true);
  };

  const handleCreate = async () => {
    if (
      !productLinkId ||
      !purchaseRate ||
      !sellingRate
    ) {
      return;
    }

    await createDistributorProductRate.mutateAsync({
      product_link_id: productLinkId,
      purchase_rate: Number(purchaseRate),
      selling_rate: Number(sellingRate),
      effective_from: effectiveFrom || undefined,
      effective_to: effectiveTo || undefined,
      is_active: isActive,
    });

    resetForm();
  };

  const handleEdit = (item: (typeof allDistributorRates)[number]) => {
    setEditingRateId(item.id);
    setProductLinkId(item.link.id);
    setPurchaseRate(String(item.purchase_rate));
    setSellingRate(String(item.selling_rate));
    setEffectiveFrom(
      item.effective_from
        ? item.effective_from.slice(0, 10)
        : "",
    );
    setEffectiveTo(
      item.effective_to
        ? item.effective_to.slice(0, 10)
        : "",
    );
    setIsActive(item.is_active);
    setIsAdding(true);
  };

  const handleUpdate = async () => {
    if (
      !editingRateId ||
      !productLinkId ||
      !purchaseRate ||
      !sellingRate
    ) {
      return;
    }

    await updateDistributorProductRate.mutateAsync({
      id: editingRateId,
      data: {
        product_link_id: productLinkId,
        purchase_rate: Number(purchaseRate),
        selling_rate: Number(sellingRate),
        effective_from: effectiveFrom || undefined,
        effective_to: effectiveTo || undefined,
        is_active: isActive,
      },
    });

    resetForm();
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this distributor rate?",
      )
    ) {
      return;
    }

    await deleteDistributorProductRate.mutateAsync(id);
  };

  return (
    <MasterSection
      title="Distributor Product Rates"
      action={
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setIsAdding(true);
          }}
        >
          <Plus className="mr-2 size-4" />
          Add Distributor Rate
        </Button>
      }
    >

      {isAdding && (
        <div className="rounded-lg border p-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Distributor
              </label>

              <select
                value={productLinkId ?? ""}
                onChange={(event) =>
                  setProductLinkId(
                    event.target.value
                      ? Number(event.target.value)
                      : null,
                  )
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">
                  Select distributor
                </option>

                {productLinks.map((link) => (
                  <option key={link.id} value={link.id}>
                    {link.distributor.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Purchase Rate
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={purchaseRate}
                onChange={(event) =>
                  setPurchaseRate(event.target.value)
                }
                placeholder="Enter purchase rate"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Selling Rate
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={sellingRate}
                onChange={(event) =>
                  setSellingRate(event.target.value)
                }
                placeholder="Enter selling rate"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Effective From
              </label>

              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) =>
                  setEffectiveFrom(event.target.value)
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Effective To
              </label>

              <input
                type="date"
                value={effectiveTo}
                onChange={(event) =>
                  setEffectiveTo(event.target.value)
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
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
              variant="outline"
              onClick={resetForm}
              disabled={
                createDistributorProductRate.isPending ||
                updateDistributorProductRate.isPending
              }
            >
              Cancel
            </Button>

            <Button
              onClick={
                editingRateId
                  ? handleUpdate
                  : handleCreate
              }
              disabled={
                !productLinkId ||
                !purchaseRate ||
                !sellingRate ||
                createDistributorProductRate.isPending ||
                updateDistributorProductRate.isPending
              }
            >
              {createDistributorProductRate.isPending ||
                updateDistributorProductRate.isPending
                ? "Saving..."
                : editingRateId
                  ? "Update Rate"
                  : "Add Rate"}
            </Button>
          </div>
        </div>
      )}

      <MasterTable
        headers={[
          {
            label: "Distributor",
          },
          {
            label: "Purchase Rate",
            align: "right",
          },
          {
            label: "Selling Rate",
            align: "right",
          },
          {
            label: "Effective",
          },
          {
            label: "Status",
            align: "center",
          },
          {
            label: "Actions",
            align: "center",
          },
        ]}
        empty={allDistributorRates.length === 0}
        emptyMessage="No client rates configured."
      >
        {allDistributorRates.map((item) => {
          const isCurrent = isRateCurrent(
            item.effective_from,
            item.effective_to,
          );

          const isExpired = isRateExpired(
            item.effective_to,
          );

          return (
            <MasterTableRow
              key={item.id}
              className={isExpired ? "opacity-50" : ""}
            >
              <MasterTableCell className="font-medium">
                {item.distributorName}
              </MasterTableCell>

              <MasterTableCell
                align="right"
                className="font-mono"
              >
                ₹{Number(item.purchase_rate).toFixed(2)}
              </MasterTableCell>

              <MasterTableCell
                align="right"
                className="font-mono"
              >
                ₹{Number(item.selling_rate).toFixed(2)}
              </MasterTableCell>

              <MasterTableCell className="text-xs text-muted-foreground">
                {formatDateForDisplay(item.effective_from)}{" "}
                to{" "}
                {item.effective_to
                  ? formatDateForDisplay(item.effective_to)
                  : "—"}
              </MasterTableCell>

              <MasterTableCell align="center">
                <Badge
                  variant={
                    isCurrent ? "default" : "secondary"
                  }
                  className="text-xs"
                >
                  {isCurrent
                    ? "Current"
                    : isExpired
                      ? "Expired"
                      : "Future"}
                </Badge>
              </MasterTableCell>

              <MasterTableActions>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Edit rate"
                  onClick={() => handleEdit(item)}
                >
                  <Edit className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Delete rate"
                  onClick={() => handleDelete(item.id)}
                  disabled={
                    deleteDistributorProductRate.isPending
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </MasterTableActions>
            </MasterTableRow>
          );
        })}
      </MasterTable>
    </MasterSection>
  );
}