import { useState } from "react";

import { EmployeesTable } from "../components/EmployeesTable";
import { EmployeeModal } from "../components/EmployeeModal";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { MasterPageHeader } from "../../shared/components/MasterPageHeader";
import { useEmployees } from "../queries/useEmployees";

import { useCreateEmployee } from "../mutations/useCreateEmployee";
import { useUpdateEmployee } from "../mutations/useUpdateEmployee";
import { useDeleteEmployee } from "../mutations/useDeleteEmployee";

import type {
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
} from "../types/employees.types";

export default function EmployeesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] =
    useState<number | null>(null);

  const {
    data: employees = [],
    isLoading,
    isError,
  } = useEmployees();

  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();

  const editingEmployee =
    employees.find(
      (employee) => employee.id === editingEmployeeId,
    ) ?? null;

  const handleAdd = () => {
    setEditingEmployeeId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingEmployeeId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (
      createEmployee.isPending ||
      updateEmployee.isPending
    ) {
      return;
    }

    setIsModalOpen(false);
    setEditingEmployeeId(null);
  };

  const handleSubmit = async (
    data: CreateEmployeeRequest | UpdateEmployeeRequest,
  ) => {
    if (editingEmployeeId === null) {
      await createEmployee.mutateAsync(
        data as CreateEmployeeRequest,
      );
    } else {
      await updateEmployee.mutateAsync({
        id: editingEmployeeId,
        data: data as UpdateEmployeeRequest,
      });
    }

    setIsModalOpen(false);
    setEditingEmployeeId(null);
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this employee?",
      )
    ) {
      return;
    }

    await deleteEmployee.mutateAsync(id);
  };

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Employees"
        description="Manage employee master data."
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Employee
          </Button>
        }
      />

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          Loading employees...
        </div>
      ) : isError ? (
        <div className="p-6 text-center text-destructive">
          Failed to load employees.
        </div>
      ) : (
        <EmployeesTable
          employees={employees}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isDeleting={deleteEmployee.isPending}
        />
      )}

      <EmployeeModal
        open={isModalOpen}
        employee={editingEmployee}
        isSubmitting={
          createEmployee.isPending ||
          updateEmployee.isPending
        }
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}