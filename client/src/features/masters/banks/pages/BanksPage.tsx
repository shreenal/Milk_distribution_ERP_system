import { useState } from "react";

import { BanksTable } from "../components/BanksTable";
import { BankModal } from "../components/BankModal";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { MasterPageHeader } from "../../shared/components/MasterPageHeader";

import { useBanks } from "../queries/useBanks";

import { useCreateBank } from "../mutations/useCreateBank";
import { useUpdateBank } from "../mutations/useUpdateBank";
import { useDeleteBank } from "../mutations/useDeleteBank";

import type {
  CreateBankRequest,
  UpdateBankRequest,
} from "../types/banks.types";

export default function BanksPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBankId, setEditingBankId] =
    useState<number | null>(null);

  const {
    data: banks = [],
    isLoading,
    isError,
  } = useBanks();

  const createBank = useCreateBank();
  const updateBank = useUpdateBank();
  const deleteBank = useDeleteBank();

  const editingBank =
    banks.find((bank) => bank.id === editingBankId) ?? null;

  const handleAdd = () => {
    setEditingBankId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingBankId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (
      createBank.isPending ||
      updateBank.isPending
    ) {
      return;
    }

    setIsModalOpen(false);
    setEditingBankId(null);
  };

  const handleSubmit = async (
    data: CreateBankRequest | UpdateBankRequest,
  ) => {
    if (editingBankId === null) {
      await createBank.mutateAsync(
        data as CreateBankRequest,
      );
    } else {
      await updateBank.mutateAsync({
        id: editingBankId,
        data: data as UpdateBankRequest,
      });
    }

    setIsModalOpen(false);
    setEditingBankId(null);
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this bank?",
      )
    ) {
      return;
    }

    await deleteBank.mutateAsync(id);
  };

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Banks"
        description="Manage bank master data."
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Bank
          </Button>
        }
      />

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          Loading banks...
        </div>
      ) : isError ? (
        <div className="p-6 text-center text-destructive">
          Failed to load banks.
        </div>
      ) : (
        <BanksTable
          banks={banks}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isDeleting={deleteBank.isPending}
        />
      )}

      <BankModal
        open={isModalOpen}
        bank={editingBank}
        isSubmitting={
          createBank.isPending ||
          updateBank.isPending
        }
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}