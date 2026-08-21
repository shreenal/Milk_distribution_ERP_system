import { Edit, Settings2, Trash2 } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type { Group } from "../types/groups.types";

interface GroupsTableProps {
  groups: Group[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onSupplyRules: (id: number) => void;
}

export function GroupsTable({
  groups,
  onEdit,
  onDelete,
  onSupplyRules,
}: GroupsTableProps) {
  return (
    <MasterTable
      headers={[
        {
          label: "Name",
        },
        {
          label: "Delivery Session",
        },
        {
          label: "Vehicle",
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
      empty={groups.length === 0}
      emptyMessage="No groups found"
    >
      {groups.map((group) => (
        <MasterTableRow key={group.id}>
          <MasterTableCell className="font-medium">
            {group.name}
          </MasterTableCell>

          <MasterTableCell>
            <Badge variant="secondary">
              {group.delivery_session}
            </Badge>
          </MasterTableCell>

          <MasterTableCell>
            {group.vehicle_id ?? "—"}
          </MasterTableCell>

          <MasterTableCell align="center">
            <Badge
              variant={
                group.is_active
                  ? "default"
                  : "secondary"
              }
            >
              {group.is_active
                ? "Active"
                : "Inactive"}
            </Badge>
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit group"
              onClick={() => onEdit(group.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete group"
              onClick={() => onDelete(group.id)}
            >
              <Trash2 className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Configure supply rules"
              onClick={() => onSupplyRules(group.id)}
            >
              <Settings2 className="size-4" />
            </Button>
          </MasterTableActions>
        </MasterTableRow>
      ))}
    </MasterTable>
  );
}