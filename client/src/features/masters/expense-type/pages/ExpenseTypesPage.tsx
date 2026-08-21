import { useState } from "react";

import { ExpenseTypesTable } from "../components/ExpenseTypesTable";
import { ExpenseTypeModal } from "../components/ExpenseTypeModal";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { MasterPageHeader } from "../../shared/components/MasterPageHeader";

import { useExpenseTypes } from "../queries/useExpenseTypes";

import { useCreateExpenseType } from "../mutations/useCreateExpenseType";
import { useUpdateExpenseType } from "../mutations/useUpdateExpenseType";
import { useDeleteExpenseType } from "../mutations/useDeleteExpenseType";

import type {
  CreateExpenseTypeRequest,
  UpdateExpenseTypeRequest,
} from "../types/expense-types.types";

export default function ExpenseTypesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpenseTypeId, setEditingExpenseTypeId] =
    useState<number | null>(null);

  const {
    data: expenseTypes = [],
    isLoading,
    isError,
  } = useExpenseTypes();

  const createExpenseType = useCreateExpenseType();
  const updateExpenseType = useUpdateExpenseType();
  const deleteExpenseType = useDeleteExpenseType();

  const editingExpenseType =
    expenseTypes.find(
      (expenseType) =>
        expenseType.id === editingExpenseTypeId,
    ) ?? null;

  const handleAdd = () => {
    setEditingExpenseTypeId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingExpenseTypeId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (
      createExpenseType.isPending ||
      updateExpenseType.isPending
    ) {
      return;
    }

    setIsModalOpen(false);
    setEditingExpenseTypeId(null);
  };

  const handleSubmit = async (
    data:
      | CreateExpenseTypeRequest
      | UpdateExpenseTypeRequest,
  ) => {
    if (editingExpenseTypeId === null) {
      await createExpenseType.mutateAsync(
        data as CreateExpenseTypeRequest,
      );
    } else {
      await updateExpenseType.mutateAsync({
        id: editingExpenseTypeId,
        data: data as UpdateExpenseTypeRequest,
      });
    }

    setIsModalOpen(false);
    setEditingExpenseTypeId(null);
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this expense type?",
      )
    ) {
      return;
    }

    await deleteExpenseType.mutateAsync(id);
  };

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Expense Type"
        description="Manage expense types"
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Expense Type
          </Button>
        }
      />

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          Loading expense types...
        </div>
      ) : isError ? (
        <div className="p-6 text-center text-destructive">
          Failed to load expense types.
        </div>
      ) : (
        <ExpenseTypesTable
          expenseTypes={expenseTypes}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isDeleting={deleteExpenseType.isPending}
        />
      )}

      <ExpenseTypeModal
        open={isModalOpen}
        expenseType={editingExpenseType}
        isSubmitting={
          createExpenseType.isPending ||
          updateExpenseType.isPending
        }
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}