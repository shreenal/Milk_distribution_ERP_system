import { useState } from "react";

import { GroupsTable } from "../components/GroupsTable";
import { GroupModal } from "../components/GroupModal";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { MasterPageHeader } from "../../shared/components/MasterPageHeader";

import { useGroups } from "../queries/useGroups";
import { GroupSupplyRulesSection } from "../components/GroupSupplyRulesSection";
import { useGroupSupplyRules } from "../queries/useGroupSupplyRules";
import { useDistributors } from "../../distributors/queries/useDistributors";
import { useDeleteGroup } from "../mutations/useDeleteGroup";

export default function GroupsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(
    null,
  );

  const {
    data: groups = [],
    isLoading,
    isError,
  } = useGroups();

  const {
    data: supplyRules = [],
    isLoading: isSupplyRulesLoading,
    isError: isSupplyRulesError,
  } = useGroupSupplyRules();

  const {
    data: distributors = [],
    isLoading: isDistributorsLoading,
  } = useDistributors();

  const [supplyRulesGroupId, setSupplyRulesGroupId] =
    useState<number | null>(null);

  const editingGroup =
    groups.find((group) => group.id === editingGroupId) ?? null;

  const supplyRulesGroup =
    groups.find(
      (group) => group.id === supplyRulesGroupId,
    ) ?? null;

  const selectedSupplyRules = supplyRules.filter(
    (rule) => rule.group_id === supplyRulesGroupId,
  );


  const deleteGroup = useDeleteGroup();

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this group?")) {
      return;
    }

    await deleteGroup.mutateAsync(id);

    if (supplyRulesGroupId === id) {
      setSupplyRulesGroupId(null);
    }
  };

  const handleAdd = () => {
    setEditingGroupId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingGroupId(id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingGroupId(null);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Loading groups...
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <p className="text-destructive">
          Failed to load groups.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Groups"
        description="Manage group master data."
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Group
          </Button>
        }
      />

      <GroupsTable
        groups={groups}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onSupplyRules={(id) => setSupplyRulesGroupId(id)}
      />
      {supplyRulesGroup && (
        <div className="rounded-lg border p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              {supplyRulesGroup.name} — Supply Rules
            </h2>

            <p className="text-sm text-muted-foreground">
              Configure distributors for this group's supply
              categories.
            </p>
          </div>


          <GroupSupplyRulesSection
            groupId={supplyRulesGroup.id}
            rules={selectedSupplyRules}
            distributors={distributors}
            isLoading={
              isSupplyRulesLoading ||
              isDistributorsLoading
            }
          />

        </div>
      )}

      <GroupModal
        open={isModalOpen}
        onClose={handleCloseModal}
        group={editingGroup}
      />
    </div>
  );
}