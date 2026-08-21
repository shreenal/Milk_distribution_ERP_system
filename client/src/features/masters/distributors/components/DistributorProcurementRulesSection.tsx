import { Fragment, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  MasterSection,
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
  MasterDataSelector,
} from "../../shared/components";

import type {
  DistributorProcurementRule,
  SupplyCategory,
} from "../types/distributors.types";

import { useCreateProcurementRule } from "../mutations/useCreateProcurementRule";
import { useUpdateProcurementRule } from "../mutations/useUpdateProcurementRule";
import { useDeleteProcurementRule } from "../mutations/useDeleteProcurementRule";

import { useBrandsActive } from "../../brands/queries/useBrands";
import { useProductGroups } from "../../product-groups/queries/useProductGroups";

interface DistributorProcurementRulesSectionProps {
  distributorId: number;
  procurementRules: DistributorProcurementRule[];
}

export function DistributorProcurementRulesSection({
  distributorId,
  procurementRules,
}: DistributorProcurementRulesSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingRuleId, setEditingRuleId] =
    useState<number | null>(null);

  const [brandId, setBrandId] =
    useState<number | null>(null);

  const [productGroupId, setProductGroupId] =
    useState<number | null>(null);

  const [category, setCategory] =
    useState<SupplyCategory>("MILK");

  const {
    data: brands = [],
    isLoading: isBrandsLoading,
    isError: isBrandsError,
  } = useBrandsActive();

  const {
    data: productGroups = [],
    isLoading: isProductGroupsLoading,
    isError: isProductGroupsError,
  } = useProductGroups();

  const createProcurementRule =
    useCreateProcurementRule(distributorId);

  const updateProcurementRule =
    useUpdateProcurementRule(distributorId);

  const deleteProcurementRule =
    useDeleteProcurementRule(distributorId);

  const resetForm = () => {
    setBrandId(null);
    setProductGroupId(null);
    setCategory("MILK");
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    resetForm();
  };

  const handleCreate = async () => {
    if (!brandId || !productGroupId) {
      return;
    }

    await createProcurementRule.mutateAsync({
      distributor_id: distributorId,
      brand_id: brandId,
      product_group_id: productGroupId,
      category,
      is_active: true,
    });

    resetForm();
    setIsAdding(false);
  };

  const handleToggleActive = async (
    rule: DistributorProcurementRule,
  ) => {
    await updateProcurementRule.mutateAsync({
      id: rule.id,
      data: {
        is_active: !rule.is_active,
      },
    });

    setEditingRuleId(null);
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to remove this procurement rule?",
      )
    ) {
      return;
    }

    await deleteProcurementRule.mutateAsync(id);
  };

  return (
    <MasterSection
      title={`Procurement Rules (${procurementRules.length})`}
      description="Configure which product groups this distributor is eligible to procure."
      action={
        !isAdding ? (
          <Button
            size="sm"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="mr-2 size-4" />
            Add Procurement Rule
          </Button>
        ) : undefined
      }
    >
      {isAdding && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">
              Add Procurement Rule
            </p>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCancelAdd}
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Brand */}
          <MasterDataSelector
            label="Brand"
            placeholder={
              isBrandsLoading
                ? "Loading brands..."
                : "Select brand"
            }
            value={brandId ?? undefined}
            onChange={(value) => setBrandId(value ?? null)}
            options={brands}
            isLoading={isBrandsLoading}
            error={
              isBrandsError
                ? "Failed to load brands."
                : undefined
            }
            required
            getOptionLabel={(brand) => brand.name}
            getOptionValue={(brand) => brand.id}
          />

          {/* Product Group */}
          <MasterDataSelector
            label="Product Group"
            placeholder={
              isProductGroupsLoading
                ? "Loading product groups..."
                : "Select product group"
            }
            value={productGroupId ?? undefined}
            onChange={(value) => setProductGroupId(value ?? null)}
            options={productGroups}
            isLoading={isProductGroupsLoading}
            error={
              isProductGroupsError
                ? "Failed to load product groups."
                : undefined
            }
            required
            getOptionLabel={(group) => group.name}
            getOptionValue={(group) => group.id}
          />

          {/* Supply Category */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Supply Category
            </label>

            <select
              value={category}
              onChange={(event) =>
                setCategory(
                  event.target.value as SupplyCategory,
                )
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="MILK">Milk</option>
              <option value="NON_MILK">
                Non-Milk
              </option>
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleCancelAdd}
            >
              Cancel
            </Button>

            <Button
              onClick={handleCreate}
              disabled={
                !brandId ||
                !productGroupId ||
                createProcurementRule.isPending
              }
            >
              {createProcurementRule.isPending
                ? "Adding..."
                : "Add Procurement Rule"}
            </Button>
          </div>
        </div>
      )}

      {procurementRules.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No procurement rules configured for this distributor.
        </p>
      ) : (
        <MasterTable
          headers={[
            { label: "Brand" },
            { label: "Product Group" },
            { label: "Category" },
            { label: "Status" },
            {
              label: "Actions",
              align: "center",
              className: "w-[140px]",
            },
          ]}
        >
          {procurementRules.map((rule) => (
            <Fragment key={rule.id}>
              <MasterTableRow>
                <MasterTableCell className="font-medium">
                  {rule.master_brand?.name ??
                    `Brand #${rule.brand_id}`}
                </MasterTableCell>

                <MasterTableCell>
                  {rule.master_product_group?.name ??
                    `Product Group #${rule.product_group_id}`}
                </MasterTableCell>

                <MasterTableCell>
                  {rule.category}
                </MasterTableCell>

                <MasterTableCell align="center">
                  <Badge
                    variant={
                      rule.is_active
                        ? "default"
                        : "secondary"
                    }
                  >
                    {rule.is_active
                      ? "Eligible"
                      : "Inactive"}
                  </Badge>
                </MasterTableCell>


                <MasterTableActions>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Edit procurement rule"
                    onClick={() =>
                      setEditingRuleId(
                        editingRuleId === rule.id
                          ? null
                          : rule.id,
                      )
                    }
                  >
                    <Pencil className="size-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Delete procurement rule"
                    onClick={() =>
                      handleDelete(rule.id)
                    }
                    disabled={
                      deleteProcurementRule.isPending
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </MasterTableActions>

              </MasterTableRow>

              {editingRuleId === rule.id && (
                <MasterTableRow>
                  <MasterTableCell
                    colSpan={5}
                    className="bg-muted/20"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleToggleActive(rule)
                      }
                      disabled={
                        updateProcurementRule.isPending
                      }
                    >
                      {rule.is_active
                        ? "Deactivate"
                        : "Activate"}
                    </Button>
                  </MasterTableCell>
                </MasterTableRow>
              )}
            </Fragment>
          ))}
        </MasterTable>
      )}
    </MasterSection>
  );
}