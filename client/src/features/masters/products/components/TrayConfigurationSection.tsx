import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

import {
  MasterSection,
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type {
  ProductConfiguration,
  ProductTrayRule,
} from "../types/products.types";

import { useCreateTrayRule } from "../mutations/useCreateTrayRule";
import { useUpdateTrayRule } from "../mutations/useUpdateTrayRule";
import { useDeleteTrayRule } from "../mutations/useDeleteTrayRule";
import { useTrays } from "../../trays/queries/useTrays";
import React from "react";

interface TrayConfigurationSectionProps {
  product: ProductConfiguration;
  trayRules: ProductTrayRule[];
}

export function TrayConfigurationSection({
  product,
  trayRules,
}: TrayConfigurationSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);

  // Placeholder until tray-type/master selection is wired.
  const [trayTypeId, setTrayTypeId] = useState<number | null>(null);

  const {
    data: trays = [],
    isLoading: isTraysLoading,
    isError: isTraysError,
  } = useTrays();

  const availableTrays = trays.filter(
    (tray) =>
      tray.is_active &&
      tray.brand_id === product.brand_id,
  );
  const createTrayRule = useCreateTrayRule(product.id);
  const updateTrayRule = useUpdateTrayRule(product.id);
  const deleteTrayRule = useDeleteTrayRule(product.id);

  const activeRules = trayRules.filter((rule) => rule.is_active);

  const handleCreate = async () => {
    if (!trayTypeId) {
      return;
    }

    const data = {
      brand_id: product.brand_id,
      product_group_id: product.product_group_id,
      tray_type_id: trayTypeId,
      applies_to_packaging: true,
      is_active: true,
      ...(product.product_type_id !== null && {
        product_type_id: product.product_type_id,
      }),
      ...(product.packaging_type_id !== null && {
        packaging_type_id: product.packaging_type_id,
      }),
    };

    await createTrayRule.mutateAsync(data);

    setTrayTypeId(null);
    setIsAdding(false);
  };

  const handleToggleActive = async (rule: ProductTrayRule) => {
    await updateTrayRule.mutateAsync({
      id: rule.id,
      data: {
        is_active: !rule.is_active,
      },
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to remove this tray rule?")) {
      return;
    }

    await deleteTrayRule.mutateAsync(id);
  };

  return (
    <MasterSection
      title={`Tray Configuration (${activeRules.length})`}
      action={
        !isAdding ? (
          <Button
            size="sm"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="mr-2 size-4" />
            Add Tray Type
          </Button>
        ) : undefined
      }
    >
      {isAdding && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">
              Add Tray Configuration
            </p>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setIsAdding(false);
                setTrayTypeId(null);
              }}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Tray Type
            </label>

            <select
              value={trayTypeId ?? ""}
              onChange={(event) =>
                setTrayTypeId(
                  event.target.value
                    ? Number(event.target.value)
                    : null,
                )
              }
              disabled={isTraysLoading}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">
                {isTraysLoading
                  ? "Loading tray types..."
                  : "Select tray type"}
              </option>

              {availableTrays.map((tray) => (
                <option key={tray.id} value={tray.id}>
                  {tray.color}
                  {tray.description
                    ? ` — ${tray.description}`
                    : ""}
                </option>
              ))}
            </select>

            {isTraysError && (
              <p className="text-xs text-destructive">
                Failed to load tray types.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              This rule applies to{" "}
              {product.master_brand.name} ·{" "}
              {product.master_product_group.name} ·{" "}
              {product.master_packaging_type?.name}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsAdding(false);
                setTrayTypeId(null);
              }}
            >
              Cancel
            </Button>

            <Button
              onClick={handleCreate}
              disabled={
                !trayTypeId ||
                createTrayRule.isPending
              }
            >
              {createTrayRule.isPending
                ? "Adding..."
                : "Add Tray Type"}
            </Button>
          </div>
        </div>
      )}

      {activeRules.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No tray types configured.
        </p>
      ) : (
        <MasterTable
          headers={[
            {
              label: "Tray Type",
              align: "left",
            },
            {
              label: "Description",
              align: "left",
            },
            {
              label: "Packaging",
              align: "left",
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
        >
          {activeRules.map((rule) => (
            <React.Fragment key={rule.id}>
              <MasterTableRow>
                <MasterTableCell>
                  <span className="font-medium">
                    {rule.master_tray_type.color}
                  </span>
                </MasterTableCell>

                <MasterTableCell className="text-muted-foreground">
                  {rule.master_tray_type.description || "—"}
                </MasterTableCell>

                <MasterTableCell className="text-muted-foreground">
                  {rule.applies_to_packaging
                    ? "This packaging"
                    : "All packaging"}
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
                      ? "Active"
                      : "Inactive"}
                  </Badge>
                </MasterTableCell>

                <MasterTableActions>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Edit tray rule"
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
                    title="Delete tray rule"
                    onClick={() =>
                      handleDelete(rule.id)
                    }
                    disabled={
                      deleteTrayRule.isPending
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
                        updateTrayRule.isPending
                      }
                    >
                      {rule.is_active
                        ? "Deactivate"
                        : "Activate"}
                    </Button>
                  </MasterTableCell>
                </MasterTableRow>
              )}
            </React.Fragment>
          ))}
        </MasterTable>
      )}
    </MasterSection>
  );
}