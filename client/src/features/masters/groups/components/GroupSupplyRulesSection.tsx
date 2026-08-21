import { useState } from "react";

import { Edit, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

import {
  useCreateGroupSupplyRule,
} from "../mutations/useCreateGroupSupplyRule";
import {
  useUpdateGroupSupplyRule,
} from "../mutations/useUpdateGroupSupplyRule";
import {
  useDeleteGroupSupplyRule,
} from "../mutations/useDeleteGroupSupplyRule";

import type {
  GroupSupplyRule,
  SupplyCategory,
} from "../types/groups.types";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

interface GroupSupplyRulesSectionProps {
  groupId: number;
  rules: GroupSupplyRule[];
  distributors: {
    id: number;
    name: string;
  }[];
  isLoading?: boolean;
}

export function GroupSupplyRulesSection({
  groupId,
  rules,
  distributors,
  isLoading = false,
}: GroupSupplyRulesSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingRuleId, setEditingRuleId] =
    useState<number | null>(null);

  const [category, setCategory] =
    useState<SupplyCategory>("MILK");

  const [distributorId, setDistributorId] =
    useState<number | null>(null);

  const [isActive, setIsActive] = useState(true);

  const createRule = useCreateGroupSupplyRule();
  const updateRule = useUpdateGroupSupplyRule();
  const deleteRule = useDeleteGroupSupplyRule();

  const editingRule =
    rules.find((rule) => rule.id === editingRuleId) ?? null;

  const resetForm = () => {
    setIsAdding(false);
    setEditingRuleId(null);
    setCategory("MILK");
    setDistributorId(null);
    setIsActive(true);
  };

  const handleAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const handleEdit = (rule: GroupSupplyRule) => {
    setEditingRuleId(rule.id);
    setCategory(rule.category);
    setDistributorId(rule.distributor_id);
    setIsActive(rule.is_active);
    setIsAdding(true);
  };

  const handleSubmit = async () => {
    if (!distributorId) {
      return;
    }

    if (editingRule) {
      await updateRule.mutateAsync({
        id: editingRule.id,
        data: {
          group_id: groupId,
          category,
          distributor_id: distributorId,
          is_active: isActive,
        },
      });
    } else {
      await createRule.mutateAsync({
        group_id: groupId,
        category,
        distributor_id: distributorId,
        is_active: isActive,
      });
    }

    resetForm();
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this supply rule?",
      )
    ) {
      return;
    }

    await deleteRule.mutateAsync(id);
  };

  const isSaving =
    createRule.isPending || updateRule.isPending;

  const hasMilkRule = rules.some(
    (rule) => rule.category === "MILK",
  );

  const hasNonMilkRule = rules.some(
    (rule) => rule.category === "NON_MILK",
  );

  const categoryAlreadyConfigured =
    !editingRule &&
    ((category === "MILK" && hasMilkRule) ||
      (category === "NON_MILK" && hasNonMilkRule));

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading supply rules...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">
            Supply Rules
          </h3>

          <p className="text-xs text-muted-foreground">
            Configure which distributor supplies each
            category for this group.
          </p>
        </div>

        {!isAdding && (
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Rule
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="rounded-lg border p-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Category
              </label>

              <select
                value={category}
                onChange={(event) =>
                  setCategory(
                    event.target.value as SupplyCategory,
                  )
                }
                disabled={Boolean(editingRule)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="MILK">
                  MILK
                </option>

                <option value="NON_MILK">
                  NON_MILK
                </option>
              </select>
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
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
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

          {categoryAlreadyConfigured && (
            <p className="text-sm text-destructive">
              A rule for this category already exists.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={resetForm}
              disabled={isSaving}
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={
                !distributorId ||
                categoryAlreadyConfigured ||
                isSaving
              }
            >
              {isSaving
                ? "Saving..."
                : editingRule
                  ? "Update Rule"
                  : "Add Rule"}
            </Button>
          </div>
        </div>
      )}

      <MasterTable
        headers={[
          {
            label: "Category",
          },
          {
            label: "Distributor",
          },
          {
            label: "Status",
            align:"center",
          },
          {
            label: "Actions",
            align: "center",
            className: "w-[140px]",
          },
        ]}
        empty={rules.length === 0}
        emptyMessage="No supply rules configured."
      >
        {rules.map((rule) => {
          const distributor = distributors.find(
            (item) => item.id === rule.distributor_id,
          );

          return (
            <MasterTableRow key={rule.id}>
              <MasterTableCell>
                <Badge variant="secondary">
                  {rule.category}
                </Badge>
              </MasterTableCell>

              <MasterTableCell className="font-medium">
                {distributor?.name ??
                  `Distributor #${rule.distributor_id}`}
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
                  title="Edit rule"
                  onClick={() => handleEdit(rule)}
                >
                  <Edit className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Delete rule"
                  onClick={() => handleDelete(rule.id)}
                  disabled={deleteRule.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </MasterTableActions>
            </MasterTableRow>
          );
        })}
      </MasterTable>
    </div>
  );
}