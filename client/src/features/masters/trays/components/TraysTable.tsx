import { Edit, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import type { TrayType } from "../types/trays.types";
import { useDeleteTray } from "../mutations/useDeleteTray";

interface TraysTableProps {
  trays: TrayType[];
  onEdit: (id: number) => void;
  onConfigure: (id: number) => void;
}

export function TraysTable({
  trays,
  onEdit,
  onConfigure,
}: TraysTableProps) {
  const deleteTray = useDeleteTray();

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this tray type?")) {
      return;
    }

    await deleteTray.mutateAsync(id);
  };

  return (
    <MasterTable
      headers={[
        {
          label: "Brand",
        },
        {
          label: "Color",
        },
        {
          label: "Description",
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
      empty={trays.length === 0}
      emptyMessage="No tray types found"
    >
      {trays.map((tray) => (
        <MasterTableRow key={tray.id}>
          <MasterTableCell>
            {tray.master_brand.name}
          </MasterTableCell>

          <MasterTableCell className="font-medium">
            {tray.color}
          </MasterTableCell>

          <MasterTableCell className="text-muted-foreground">
            {tray.description || "—"}
          </MasterTableCell>

          <MasterTableCell align="center">
            <Badge
              variant={
                tray.is_active
                  ? "default"
                  : "secondary"
              }
            >
              {tray.is_active
                ? "Active"
                : "Inactive"}
            </Badge>
          </MasterTableCell>

          <MasterTableActions>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Configure tray type"
              onClick={() => onConfigure(tray.id)}
            >
              <Settings2 className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit tray type"
              onClick={() => onEdit(tray.id)}
            >
              <Edit className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete tray type"
              onClick={() => handleDelete(tray.id)}
              disabled={deleteTray.isPending}
            >
              <Trash2 className="size-4" />
            </Button>
          </MasterTableActions>
        </MasterTableRow>
      ))}
    </MasterTable>
  );
}