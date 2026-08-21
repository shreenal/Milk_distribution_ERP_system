import { useState } from "react";

import { TraysTable } from "../components/TraysTable";
import { TrayModal } from "../components/TrayModal";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { MasterPageHeader } from "../../shared/components/MasterPageHeader";

import { useTrays } from "../queries/useTrays";
import { useTrayRules } from "../queries/useTrayRules";

import { useBrandsActive } from "../../brands/queries/useBrands";
import { TrayProductRulesSection } from "../components/TrayProductRulesSection";
import { useProductGroups } from "../../product-groups/queries/useProductGroups";
import { useProductTypes } from "../../product-types/queries/useProductTypes";
import { usePackagingTypes } from "../../packaging-types/queries/usePackagingTypes";

export default function TraysPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrayId, setEditingTrayId] = useState<number | null>(null);
  const [configuringTrayId, setConfiguringTrayId] = useState<number | null>(null);

  const {
    data: trays = [],
    isLoading: isTraysLoading,
    isError: isTraysError,
  } = useTrays();

  const {
    data: brands = [],
    isLoading: isBrandsLoading,
    isError: isBrandsError,
  } = useBrandsActive();

  const {
    data: trayRules = [],
    isLoading: isTrayRulesLoading,
    isError: isTrayRulesError,
  } = useTrayRules();

  const {
    data: productGroups = [],
    isLoading: isProductGroupsLoading,
    isError: isProductGroupsError,
  } = useProductGroups();

  const {
    data: productTypes = [],
    isLoading: isProductTypesLoading,
    isError: isProductTypesError,
  } = useProductTypes();

  const {
    data: packagingTypes = [],
    isLoading: isPackagingTypesLoading,
    isError: isPackagingTypesError,
  } = usePackagingTypes();

  const editingTray =
    trays.find((tray) => tray.id === editingTrayId) ?? null;

  const configuringTray =
    trays.find((tray) => tray.id === configuringTrayId) ?? null;

  const handleAdd = () => {
    setEditingTrayId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (id: number) => {
    setEditingTrayId(id);
    setIsModalOpen(true);
  };

  const handleConfigure = (id: number) => {
    setConfiguringTrayId(id);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTrayId(null);
  };

  const handleCloseConfiguration = () => {
    setConfiguringTrayId(null);
  };

  if (
    isTraysLoading ||
    isBrandsLoading ||
    isTrayRulesLoading ||
    isProductGroupsLoading ||
    isProductTypesLoading ||
    isPackagingTypesLoading
  ) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          Loading tray configuration...
        </p>
      </div>
    );
  }

  if (
    isTraysError ||
    isBrandsError ||
    isTrayRulesError ||
    isProductGroupsError ||
    isProductTypesError ||
    isPackagingTypesError
  ) {
    return (
      <div className="p-6">
        <p className="text-destructive">
          Failed to load tray configuration.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Trays"
        description="Manage tray master data."
        action={
          <Button onClick={handleAdd}>
            <Plus className="mr-2 size-4" />
            Add Tray
          </Button>
        }
      />

      <TraysTable
        trays={trays}
        onEdit={handleEdit}
        onConfigure={handleConfigure}
      />

      <TrayModal
        open={isModalOpen}
        onClose={handleCloseModal}
        tray={editingTray}
        brands={brands}
      />

      {configuringTray && (
        <TrayProductRulesSection
          tray={configuringTray}
          trayRules={trayRules}
          brands={brands}
          productGroups={productGroups}
          productTypes={productTypes}
          packagingTypes={packagingTypes}
          onClose={handleCloseConfiguration}
        />
      )}
    </div>
  );
}