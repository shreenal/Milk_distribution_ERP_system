import { useState } from "react";

import { Edit, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
  MasterSection,
  MasterDataSelector,
} from "../../shared/components";
import {
  useCreateTransferRule,
} from "../mutations/useCreateTransferRule";
import {
  useUpdateTransferRule,
} from "../mutations/useUpdateTransferRule";
import {
  useDeleteTransferRule,
} from "../mutations/useDeleteTransferRule";

import type {
  DistributorTransferRule,
} from "../types/distributors.types";

interface DistributorTransferRulesSectionProps {
  rules: DistributorTransferRule[];
  distributors: {
    id: number;
    name: string;
  }[];
  isLoading?: boolean;
}

export function DistributorTransferRulesSection({
  rules,
  distributors,
  isLoading = false,
}: DistributorTransferRulesSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingRuleId, setEditingRuleId] =
    useState<number | null>(null);

  const [supplierDistributorId, setSupplierDistributorId] =
    useState<number | null>(null);

  const [ownerDistributorId, setOwnerDistributorId] =
    useState<number | null>(null);

  const [isActive, setIsActive] = useState(true);

  const createRule = useCreateTransferRule();
  const updateRule = useUpdateTransferRule();
  const deleteRule = useDeleteTransferRule();

  const editingRule =
    rules.find((rule) => rule.id === editingRuleId) ?? null;

  const resetForm = () => {
    setIsAdding(false);
    setEditingRuleId(null);
    setSupplierDistributorId(null);
    setOwnerDistributorId(null);
    setIsActive(true);
  };

  const handleAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const handleEdit = (rule: DistributorTransferRule) => {
    setEditingRuleId(rule.id);
    setSupplierDistributorId(
      rule.supplier_distributor_id,
    );
    setOwnerDistributorId(
      rule.owner_distributor_id,
    );
    setIsActive(rule.is_active);
    setIsAdding(true);
  };

  const handleSubmit = async () => {
    if (
      !supplierDistributorId ||
      !ownerDistributorId
    ) {
      return;
    }

    if (
      supplierDistributorId === ownerDistributorId
    ) {
      return;
    }

    if (editingRule) {
      await updateRule.mutateAsync({
        id: editingRule.id,
        data: {
          supplier_distributor_id:
            supplierDistributorId,
          owner_distributor_id:
            ownerDistributorId,
          is_active: isActive,
        },
      });
    } else {
      await createRule.mutateAsync({
        supplier_distributor_id:
          supplierDistributorId,
        owner_distributor_id:
          ownerDistributorId,
        is_active: isActive,
      });
    }

    resetForm();
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this transfer rule?",
      )
    ) {
      return;
    }

    await deleteRule.mutateAsync(id);
  };

  const isSaving =
    createRule.isPending ||
    updateRule.isPending;

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading transfer rules...
      </div>
    );
  }

  return (
    <MasterSection
      title="Distributor Transfer Rules"
      description="Configure which distributors are allowed to transfer supply to other distributors."
      action={
        !isAdding ? (
          <Button
            size="sm"
            onClick={handleAdd}
          >
            <Plus className="mr-2 size-4" />
            Add Transfer Rule
          </Button>
        ) : undefined
      }
    >
      {isAdding && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MasterDataSelector
              label="Supplier Distributor"
              placeholder="Select supplier distributor"
              value={supplierDistributorId ?? undefined}
              onChange={(value) =>
                setSupplierDistributorId(value ?? null)
              }
              options={distributors}
              isLoading={false}
              required
              getOptionLabel={(distributor) => distributor.name}
              getOptionValue={(distributor) => distributor.id}
            />

            <MasterDataSelector
              label="Owner Distributor"
              placeholder="Select owner distributor"
              value={ownerDistributorId ?? undefined}
              onChange={(value) =>
                setOwnerDistributorId(value ?? null)
              }
              options={distributors}
              isLoading={false}
              required
              getOptionLabel={(distributor) => distributor.name}
              getOptionValue={(distributor) => distributor.id}
            />
          </div>

          {supplierDistributorId &&
            ownerDistributorId &&
            supplierDistributorId ===
            ownerDistributorId && (
              <p className="text-sm text-destructive">
                Supplier and owner distributors must be
                different.
              </p>
            )}

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
              onClick={resetForm}
              disabled={isSaving}
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={
                !supplierDistributorId ||
                !ownerDistributorId ||
                supplierDistributorId ===
                ownerDistributorId ||
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
            label: "Supplier Distributor",
          },
          {
            label: "Owner Distributor",
          },
          {
            label: "Status",
            align: "center",
          },
          {
            label: "Actions",
            align: "center",
            className: "w-[140px]",
          },
        ]}
        empty={rules.length === 0}
        emptyMessage="No transfer rules configured."
      >
        {rules.map((rule) => {
          const supplier = distributors.find(
            (distributor) =>
              distributor.id === rule.supplier_distributor_id,
          );

          const owner = distributors.find(
            (distributor) =>
              distributor.id === rule.owner_distributor_id,
          );

          return (
            <MasterTableRow key={rule.id}>
              <MasterTableCell className="font-medium">
                {supplier?.name ??
                  `Distributor #${rule.supplier_distributor_id}`}
              </MasterTableCell>

              <MasterTableCell className="font-medium">
                {owner?.name ??
                  `Distributor #${rule.owner_distributor_id}`}
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
                  title="Edit transfer rule"
                  onClick={() => handleEdit(rule)}
                >
                  <Edit className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Delete transfer rule"
                  onClick={() =>
                    handleDelete(rule.id)
                  }
                  disabled={deleteRule.isPending}
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