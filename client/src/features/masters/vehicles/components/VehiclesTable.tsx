import { Edit, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type { Vehicle } from "../types/vehicles.types";

interface VehiclesTableProps {
  vehicles: Vehicle[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  isDeleting?: boolean;
}

export function VehiclesTable({
  vehicles,
  onEdit,
  onDelete,
  isDeleting = false,
}: VehiclesTableProps) {
  return (
    <MasterTable
      headers={[
        { label: "Vehicle Number" },
        { label: "Vehicle Name" },
        { label: "Capacity" },
        { label: "Status" },
        {
          label: "Actions",
          align: "center",
          className: "w-[140px]",
        },
      ]}
      empty={vehicles.length === 0}
      emptyMessage="No vehicles found"
    >
      {vehicles.map((vehicle) => (
        <MasterTableRow key={vehicle.id}>
          <MasterTableCell className="font-medium font-mono">
            {vehicle.vehicle_number}
          </MasterTableCell>

          <MasterTableCell>
            {vehicle.vehicle_name ?? "—"}
          </MasterTableCell>

          <MasterTableCell>
            {vehicle.capacity ?? "—"}
          </MasterTableCell>

          <MasterTableCell>
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                vehicle.is_active
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {vehicle.is_active
                ? "Active"
                : "Inactive"}
            </span>
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit vehicle"
              onClick={() => onEdit(vehicle.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete vehicle"
              onClick={() => onDelete(vehicle.id)}
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