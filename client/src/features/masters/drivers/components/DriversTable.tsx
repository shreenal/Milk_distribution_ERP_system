import { Edit, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type { Driver } from "../types/drivers.types";

interface DriversTableProps {
  drivers: Driver[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}

export function DriversTable({
  drivers,
  onEdit,
  onDelete,
  isDeleting = false,
}: DriversTableProps) {
  return (
    <MasterTable
      headers={[
        { label: "Name" },
        { label: "Contact" },
        { label: "Vehicle ID" },
        { label: "Status" },
        {
          label: "Actions",
          align: "center",
          className: "w-[140px]",
        },
      ]}
      empty={drivers.length === 0}
      emptyMessage="No drivers found"
    >
      {drivers.map((driver) => (
        <MasterTableRow key={driver.id}>
          <MasterTableCell className="font-medium">
            {driver.name}
          </MasterTableCell>

          <MasterTableCell>
            {driver.contact ?? "—"}
          </MasterTableCell>

          <MasterTableCell>
            {driver.vehicle_id ?? "—"}
          </MasterTableCell>

          <MasterTableCell>
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                driver.is_active
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {driver.is_active ? "Active" : "Inactive"}
            </span>
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit driver"
              onClick={() => onEdit(driver.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete driver"
              onClick={() => onDelete(driver.id)}
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