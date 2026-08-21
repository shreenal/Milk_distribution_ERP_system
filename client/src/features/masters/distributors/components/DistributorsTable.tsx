import { Fragment, useState } from "react";
import { Edit, Settings2, Trash2 } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";

import { Button } from "@/shared/components/ui/button";

import type { Distributor } from "../types/distributors.types";
import { useDeleteDistributor } from "../mutations/useDeleteDistributor";
import { useDistributorProcurementRules } from "../queries/useProcurementRules";
import { DistributorProcurementRulesSection } from "./DistributorProcurementRulesSection";

import {
  MasterTable,
  MasterTableRow,
  MasterTableCell,
  MasterTableActions,
} from "../../shared/components";

interface DistributorsTableProps {
  distributors: Distributor[];
  isLoading?: boolean;
  onEdit: (id: number) => void;
}

export function DistributorsTable({
  distributors,
  isLoading = false,
  onEdit,
}: DistributorsTableProps) {
  const [expandedDistributorId, setExpandedDistributorId] =
    useState<number | null>(null);

  const deleteDistributor = useDeleteDistributor();

  const {
    data: procurementRules = [],
    isLoading: isProcurementRulesLoading,
    isError: isProcurementRulesError,
  } = useDistributorProcurementRules(
    expandedDistributorId,
  );


  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this distributor?",
      )
    ) {
      return;
    }

    await deleteDistributor.mutateAsync(id);
  };

  const handleProcurementRules = (id: number) => {
    setExpandedDistributorId((current) =>
      current === id ? null : id,
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Loading distributors...
      </div>
    );
  }

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
          label: "Email",
          align: "left",
        },
        {
          label: "Status",
          align: "left",
        },
        {
          label: "Actions",
          align: "center",
        },
      ]}
      empty={distributors.length === 0}
      emptyMessage="No distributors found"
    >
      {distributors.map((distributor) => {
        const isExpanded =
          expandedDistributorId === distributor.id;

        return (
          <Fragment key={distributor.id}>
            <MasterTableRow>
              <MasterTableCell >
                {distributor.name}
              </MasterTableCell>

              <MasterTableCell>
                {distributor.contact || "—"}
              </MasterTableCell>

              <MasterTableCell>
                {distributor.email || "—"}
              </MasterTableCell>

              <MasterTableCell>
                <Badge
                  variant={
                    distributor.is_active
                      ? "default"
                      : "secondary"
                  }
                >
                  {distributor.is_active
                    ? "Active"
                    : "Inactive"}
                </Badge>
              </MasterTableCell>

              <MasterTableActions>
                <Button
                  variant={
                    isExpanded
                      ? "secondary"
                      : "ghost"
                  }
                  size="icon-sm"
                  title="Configure procurement rules"
                  onClick={() =>
                    handleProcurementRules(
                      distributor.id,
                    )
                  }
                >
                  <Settings2 className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Edit distributor"
                  onClick={() =>
                    onEdit(distributor.id)
                  }
                >
                  <Edit className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Delete distributor"
                  onClick={() =>
                    handleDelete(distributor.id)
                  }
                  disabled={deleteDistributor.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </MasterTableActions>
            </MasterTableRow>

            {isExpanded && (
              <MasterTableRow>
                <MasterTableCell
                  colSpan={5}
                  className="bg-muted/20"
                >
                  {isProcurementRulesLoading ? (
                    <div className="p-6 text-center text-muted-foreground">
                      Loading procurement rules...
                    </div>
                  ) : isProcurementRulesError ? (
                    <div className="p-6 text-center text-destructive">
                      Failed to load procurement rules.
                    </div>
                  ) : (
                    <DistributorProcurementRulesSection
                      distributorId={distributor.id}
                      procurementRules={procurementRules}
                    />
                  )}
                </MasterTableCell>
              </MasterTableRow>
            )}
          </Fragment>
        );
      })}
    </MasterTable>
  );
}