import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { MasterSection } from "../../shared/components/MasterSection";

import type {
    DistributorProcurementRule,
    ProductConfiguration,
} from "../types/products.types";

import { useCreateProcurementRule } from "../mutations/useCreateProcurementRule";
import { useUpdateProcurementRule } from "../mutations/useUpdateProcurementRule";
import { useDeleteProcurementRule } from "../mutations/useDeleteProcurementRule";
import { useDistributors } from "../../distributors/queries/useDistributors";
import { MasterTable, MasterTableActions, MasterTableCell, MasterTableRow } from "../../shared/components";

interface ProcurementRulesSectionProps {
    product: ProductConfiguration;
    procurementRules: DistributorProcurementRule[];
}

export function ProcurementRulesSection({
    product,
    procurementRules,
}: ProcurementRulesSectionProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [editingRuleId, setEditingRuleId] = useState<number | null>(null);

    // Placeholder until the active distributor master query is wired.
    const [distributorId, setDistributorId] = useState<number | null>(null);

    const {
        data: distributors = [],
        isLoading: isDistributorsLoading,
        isError: isDistributorsError,
    } = useDistributors();

    const createProcurementRule = useCreateProcurementRule(product.id);
    const updateProcurementRule = useUpdateProcurementRule(product.id);
    const deleteProcurementRule = useDeleteProcurementRule(product.id);

    const handleCreate = async () => {
        if (!distributorId) {
            return;
        }

        await createProcurementRule.mutateAsync({
            distributor_id: distributorId,
            brand_id: product.brand_id,
            product_group_id: product.product_group_id,
            category: product.master_product_group.category,
            is_active: true,
        });

        setDistributorId(null);
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
    title={`Procurement Configuration (${procurementRules.length})`}
    action={
      !isAdding ? (
        <Button
          size="sm"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="mr-2 size-4" />
          Add Distributor
        </Button>
      ) : undefined
    }
  >
    <div className="space-y-4">
      {isAdding && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">
              Add Procurement Distributor
            </p>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setIsAdding(false);
                setDistributorId(null);
              }}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Distributor
            </label>

            <select
              value={distributorId ?? ""}
              onChange={(event) =>
                setDistributorId(
                  event.target.value
                    ? Number(event.target.value)
                    : null,
                )
              }
              disabled={isDistributorsLoading}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">
                {isDistributorsLoading
                  ? "Loading distributors..."
                  : "Select distributor"}
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

            {isDistributorsError && (
              <p className="text-xs text-destructive">
                Failed to load distributors.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              This rule applies to{" "}
              {product.master_brand.name} ·{" "}
              {product.master_product_group.name} ·{" "}
              {product.master_product_group.category}.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsAdding(false);
                setDistributorId(null);
              }}
            >
              Cancel
            </Button>

            <Button
              onClick={handleCreate}
              disabled={
                !distributorId ||
                createProcurementRule.isPending
              }
            >
              {createProcurementRule.isPending
                ? "Adding..."
                : "Add Distributor"}
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
            label: "Brand",
          },
          {
            label: "Product Group",
          },
          {
            label: "Category",
          },
          {
            label: "Status",
            align: "center",
          },
          {
            label: "Actions",
            align: "center",
            className: "w-[120px]",
          },
        ]}
        empty={procurementRules.length === 0}
        emptyMessage="No procurement rules configured for this product."
      >
        {procurementRules.map((rule) => (
          <>
            <MasterTableRow key={rule.id}>
              <MasterTableCell className="font-medium">
                {rule.master_distributor.name}
              </MasterTableCell>

              <MasterTableCell>
                {rule.master_brand.name}
              </MasterTableCell>

              <MasterTableCell>
                {rule.master_product_group.name}
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
                  colSpan={6}
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
          </>
        ))}
      </MasterTable>
    </div>
  </MasterSection>
);
}