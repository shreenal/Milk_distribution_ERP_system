import { Fragment, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";

import type {
  DistributorProductLink,
  DistributorProductRate,
} from "../types/distributors.types";
import {
  MasterSection,
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
  MasterSearch,
  MasterDataSelector,
} from "../../shared/components";

import { useCreateProductRate } from "../mutations/useCreateProductRate";
import { useUpdateProductRate } from "../mutations/useUpdateProductRate";
import { useDeleteProductRate } from "../mutations/useDeleteProductRate";

interface DistributorProductRatesSectionProps {
  productLinks: DistributorProductLink[];
  productRates: DistributorProductRate[];
  products: {
    id: number;
    code: string;
    is_active: boolean;
  }[];
}

export function DistributorProductRatesSection({
  productLinks,
  productRates,
  products,
}: DistributorProductRatesSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedProductLinkId, setSelectedProductLinkId] =
    useState<number | null>(null);

  const [purchaseRate, setPurchaseRate] = useState("");
  const [sellingRate, setSellingRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");

  const createProductRate = useCreateProductRate();
  const updateProductRate = useUpdateProductRate();
  const deleteProductRate = useDeleteProductRate();
  const [editingRateId, setEditingRateId] =
    useState<number | null>(null);

  const [editPurchaseRate, setEditPurchaseRate] = useState("");
  const [editSellingRate, setEditSellingRate] = useState("");
  const [editEffectiveFrom, setEditEffectiveFrom] = useState("");
  const [editEffectiveTo, setEditEffectiveTo] = useState("");
  const handleCreate = async () => {
    if (
      selectedProductLinkId === null ||
      !purchaseRate ||
      !sellingRate
    ) {
      return;
    }

    await createProductRate.mutateAsync({
      product_link_id: selectedProductLinkId,
      purchase_rate: Number(purchaseRate),
      selling_rate: Number(sellingRate),
      effective_from: effectiveFrom || undefined,
      effective_to: effectiveTo || undefined,
      is_active: true,
    });

    resetForm();
  };

  const handleEdit = (rate: DistributorProductRate) => {
    setEditingRateId(rate.id);
    setEditPurchaseRate(String(rate.purchase_rate));
    setEditSellingRate(String(rate.selling_rate));
    setEditEffectiveFrom(rate.effective_from);
    setEditEffectiveTo(rate.effective_to ?? "");
  };

  const handleUpdate = async () => {
    if (editingRateId === null) {
      return;
    }

    await updateProductRate.mutateAsync({
      id: editingRateId,
      data: {
        purchase_rate: Number(editPurchaseRate),
        selling_rate: Number(editSellingRate),
        effective_from: editEffectiveFrom || undefined,
        effective_to: editEffectiveTo || undefined,
      },
    });

    setEditingRateId(null);
    setEditPurchaseRate("");
    setEditSellingRate("");
    setEditEffectiveFrom("");
    setEditEffectiveTo("");
  };

  const cancelEdit = () => {
    setEditingRateId(null);
    setEditPurchaseRate("");
    setEditSellingRate("");
    setEditEffectiveFrom("");
    setEditEffectiveTo("");
  };

  const handleToggleActive = async (
    rate: DistributorProductRate,
  ) => {
    await updateProductRate.mutateAsync({
      id: rate.id,
      data: {
        is_active: !rate.is_active,
      },
    });
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to remove this distributor product rate?",
      )
    ) {
      return;
    }

    await deleteProductRate.mutateAsync(id);
  };

  const resetForm = () => {
    setIsAdding(false);
    setSelectedProductLinkId(null);
    setPurchaseRate("");
    setSellingRate("");
    setEffectiveFrom("");
    setEffectiveTo("");
  };

  const getProductCode = (productId: number) => {
    return (
      products.find((product) => product.id === productId)?.code ??
      `Product #${productId}`
    );
  };
  const distributorProductLinkIds = new Set(
    productLinks.map((link) => link.id),
  );

  const distributorRates = productRates.filter((rate) =>
    distributorProductLinkIds.has(rate.product_link_id),
  );

  return (
    <MasterSection
      title="Distributor Product Rates"
      description="Configure purchase and selling rates for the selected distributor."
      action={
        !isAdding ? (
          <Button
            size="sm"
            onClick={() => setIsAdding(true)}
            disabled={!productLinks.length}
          >
            <Plus className="mr-2 size-4" />
            Add Rate
          </Button>
        ) : undefined
      }
    >

      {isAdding && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">
              Add Distributor Product Rate
            </p>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={resetForm}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Product
            </label>

            <select
              value={selectedProductLinkId ?? ""}
              onChange={(event) =>
                setSelectedProductLinkId(
                  event.target.value
                    ? Number(event.target.value)
                    : null,
                )
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">
                Select product
              </option>

              {productLinks
                .filter((link) => link.is_active)
                .map((link) => (
                  <option
                    key={link.id}
                    value={link.id}
                  >
                    {getProductCode(link.product_id)}
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={resetForm}
            >
              Cancel
            </Button>

            <Button
              onClick={handleCreate}
              disabled={
                selectedProductLinkId === null ||
                !purchaseRate ||
                !sellingRate ||
                createProductRate.isPending
              }
            >
              {createProductRate.isPending
                ? "Adding..."
                : "Add Rate"}
            </Button>
          </div>
        </div>
      )}

      {distributorRates.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No distributor product rates configured.
        </p>
      ) : (
        <MasterTable
          headers={[
            { label: "Product", align: "left" },
            { label: "Purchase Rate", align: "left" },
            { label: "Selling Rate", align: "left" },
            { label: "Effective From", align: "left" },
            { label: "Effective To", align: "left" },
            { label: "Status", align: "center" },
            { label: "Actions", align: "center" },
          ]}
        >
          {distributorRates.map((rate) => {
            const link = productLinks.find(
              (item) => item.id === rate.product_link_id,
            );

            return (
              <Fragment key={rate.id}>
                <MasterTableRow>
                  <MasterTableCell className="font-medium">
                    {link
                      ? getProductCode(link.product_id)
                      : `Link #${rate.product_link_id}`}
                  </MasterTableCell>

                  <MasterTableCell>
                    {rate.purchase_rate}
                  </MasterTableCell>

                  <MasterTableCell>
                    {rate.selling_rate}
                  </MasterTableCell>

                  <MasterTableCell>
                    {rate.effective_from}
                  </MasterTableCell>

                  <MasterTableCell>
                    {rate.effective_to ?? "—"}
                  </MasterTableCell>

                  <MasterTableCell align="center">
                    <Badge
                      variant={
                        rate.is_active
                          ? "default"
                          : "secondary"
                      }
                    >
                      {rate.is_active
                        ? "Active"
                        : "Inactive"}
                    </Badge>
                  </MasterTableCell>

                  <MasterTableActions>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(rate)}
                      disabled={editingRateId !== null}
                    >
                      Edit
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(rate)}
                      disabled={updateProductRate.isPending}
                    >
                      {rate.is_active
                        ? "Deactivate"
                        : "Activate"}
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(rate.id)}
                      disabled={deleteProductRate.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </MasterTableActions>
                </MasterTableRow>

                {editingRateId === rate.id && (
                  <MasterTableRow>
                    <MasterTableCell
                      colSpan={7}
                      className="bg-muted/20"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">
                            Edit Distributor Product Rate
                          </p>

                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={cancelEdit}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Purchase Rate
                            </label>

                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editPurchaseRate}
                              onChange={(event) =>
                                setEditPurchaseRate(
                                  event.target.value,
                                )
                              }
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
                              value={editSellingRate}
                              onChange={(event) =>
                                setEditSellingRate(
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Effective From
                            </label>

                            <input
                              type="date"
                              value={editEffectiveFrom}
                              onChange={(event) =>
                                setEditEffectiveFrom(
                                  event.target.value,
                                )
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
                              value={editEffectiveTo}
                              onChange={(event) =>
                                setEditEffectiveTo(
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </Button>

                          <Button
                            onClick={handleUpdate}
                            disabled={
                              !editPurchaseRate ||
                              !editSellingRate ||
                              updateProductRate.isPending
                            }
                          >
                            {updateProductRate.isPending
                              ? "Saving..."
                              : "Save Changes"}
                          </Button>
                        </div>
                      </div>
                    </MasterTableCell>
                  </MasterTableRow>
                )}
              </Fragment>
            );
          })}
        </MasterTable>
      )}
    </MasterSection>
  );
}