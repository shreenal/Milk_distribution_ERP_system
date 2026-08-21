import { Edit, Trash2 } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type { Employee } from "../types/employees.types";

interface EmployeesTableProps {
  employees: Employee[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}

export function EmployeesTable({
  employees,
  onEdit,
  onDelete,
  isDeleting = false,
}: EmployeesTableProps) {
  return (
    <MasterTable
      headers={[
        {
          label: "Name",
          align: "left",
        },
        {
          label: "Contact",
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
      empty={employees.length === 0}
      emptyMessage="No employees found"
    >
      {employees.map((employee) => (
        <MasterTableRow key={employee.id}>
          <MasterTableCell className="font-medium">
            {employee.name}
          </MasterTableCell>

          <MasterTableCell>
            {employee.contact ?? "—"}
          </MasterTableCell>

          <MasterTableCell align="center">
            <Badge
              variant={
                employee.is_active
                  ? "default"
                  : "secondary"
              }
            >
              {employee.is_active
                ? "Active"
                : "Inactive"}
            </Badge>
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit employee"
              onClick={() => onEdit(employee.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete employee"
              onClick={() => onDelete(employee.id)}
              disabled={isDeleting}
            >
              <Trash2 className="size-4" />
            </Button>
          </MasterTableActions>
        </MasterTableRow>
      ))}
    </MasterTable>
  );
}