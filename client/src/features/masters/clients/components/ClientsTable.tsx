import { Fragment } from "react";
import { Edit, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

import { ClientCategoriesSection } from "./ClientCategoriesSection";

import type { Client } from "../types/client.types";

interface ClientsTableProps {
  clients: Client[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onCategories: (id: number) => void;
  categoriesClientId: number | null;
  onCloseCategories: () => void;
  isDeleting?: boolean;
}

export function ClientsTable({
  clients,
  onEdit,
  onDelete,
  onCategories,
  categoriesClientId,
  onCloseCategories,
  isDeleting = false,
}: ClientsTableProps) {
  return (
    <MasterTable
      headers={[
        { label: "Code" },
        { label: "Client" },
        { label: "Shop" },
        { label: "Contact" },
        { label: "Billing Group" },
        { label: "Delivery Group" },
        { label: "Distributor" },
        { label: "Status" },
        {
          label: "Actions",
          align: "center",
          className: "w-[140px]",
        },
      ]}
      empty={clients.length === 0}
      emptyMessage="No clients found"
    >
      {clients.map((client) => (
        <Fragment key={client.id}>
          <MasterTableRow>
            <MasterTableCell className="font-mono">
              {client.code ?? "—"}
            </MasterTableCell>

            <MasterTableCell className="font-medium">
              {client.name}
            </MasterTableCell>

            <MasterTableCell>
              {client.shop_name ?? "—"}
            </MasterTableCell>

            <MasterTableCell>
              {client.contact ?? "—"}
            </MasterTableCell>

            <MasterTableCell>
              {client.billing_group?.name ?? "—"}
            </MasterTableCell>

            <MasterTableCell>
              {client.delivery_group?.name ?? "—"}
            </MasterTableCell>

            <MasterTableCell>
              {client.owner_distributor?.name ?? "—"}
            </MasterTableCell>

            <MasterTableCell>
              <span
                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                  client.is_active
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {client.is_active
                  ? "Active"
                  : "Inactive"}
              </span>
            </MasterTableCell>

            <MasterTableActions>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Edit client"
                onClick={() => onEdit(client.id)}
              >
                <Edit className="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon-sm"
                title="Configure purchase categories"
                onClick={() => onCategories(client.id)}
              >
                <Settings2 className="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon-sm"
                title="Delete client"
                onClick={() => onDelete(client.id)}
                disabled={isDeleting}
              >
                <Trash2 className="size-4" />
              </Button>
            </MasterTableActions>
          </MasterTableRow>

          {categoriesClientId === client.id && (
            <MasterTableRow className="bg-muted/20">
              <MasterTableCell
                colSpan={9}
                className="p-4"
              >
                <ClientCategoriesSection
                  clientId={client.id}
                  onClose={onCloseCategories}
                />
              </MasterTableCell>
            </MasterTableRow>
          )}
        </Fragment>
      ))}
    </MasterTable>
  );
}