import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import { DistributorsTable } from "../components/DistributorsTable";
import { DistributorModal } from "../components/DistributorModal";
import { DistributorTransferRulesSection } from "../components/DistributorTransferRulesSection";
import { DistributorProductLinksSection } from "../components/DistributorProductLinksSection";
import { DistributorProductRatesSection } from "../components/DistributorProductRatesSection";

import { useDistributors } from "../queries/useDistributors";
import { useTransferRules } from "../queries/useTransferRules";
import { useDistributorProductLinks } from "../queries/useProductLinks";
import { useProductsActive } from "../../products/queries/useProducts";
import { useDistributorProductRates } from "../queries/useProductRates";

import {
  MasterPageHeader,
  MasterSearch,
} from "../../shared/components";

export default function DistributorsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedDistributorId, setSelectedDistributorId] =
    useState<number | null>(null);
  const [search, setSearch] = useState("");

  const {
    data: distributors = [],
    isLoading: isDistributorsLoading,
    isError: isDistributorsError,
  } = useDistributors();

  const {
    data: transferRules = [],
    isLoading: isTransferRulesLoading,
    isError: isTransferRulesError,
  } = useTransferRules();

  const {
    data: productLinks = [],
    isLoading: isProductLinksLoading,
    isError: isProductLinksError,
  } = useDistributorProductLinks();

  const {
    data: products = [],
    isLoading: isProductsLoading,
    isError: isProductsError,
  } = useProductsActive();

  const {
    data: productRates = [],
    isLoading: isProductRatesLoading,
    isError: isProductRatesError,
  } = useDistributorProductRates();

  const filteredDistributors = distributors.filter((distributor) => {
    const query = search.toLowerCase();

    return (
      distributor.name.toLowerCase().includes(query) ||
      (distributor.contact ?? "").toLowerCase().includes(query) ||
      (distributor.email ?? "").toLowerCase().includes(query)
    );
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (id: number) => {
    setEditingId(id);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Distributors"
        description="Manage distributor master data."
        action={
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 size-4" />
            Add Distributor
          </Button>
        }
      />

      <MasterSearch
        value={search}
        onChange={setSearch}
        placeholder="Search distributors..."
      />

      {isDistributorsError ? (
        <div className="p-6 text-center text-destructive">
          Failed to load distributors.
        </div>
      ) : (
        <DistributorsTable
          distributors={filteredDistributors}
          isLoading={isDistributorsLoading}
          onEdit={handleOpenEdit}
        />
      )}

      <DistributorTransferRulesSection
        rules={transferRules}
        distributors={distributors}
        isLoading={
          isTransferRulesLoading ||
          isDistributorsLoading
        }
      />

      {isTransferRulesError && (
        <p className="text-sm text-destructive">
          Failed to load distributor transfer rules.
        </p>
      )}

      {isProductLinksLoading || isProductsLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          Loading product links...
        </div>
      ) : isProductLinksError || isProductsError ? (
        <p className="text-sm text-destructive">
          Failed to load product links.
        </p>
      ) : (
        <DistributorProductLinksSection
          distributors={distributors}
          selectedDistributorId={selectedDistributorId}
          onDistributorChange={setSelectedDistributorId}
          productLinks={productLinks}
          products={products}
        />
      )}

      {selectedDistributorId !== null && (
        <>
          {isProductLinksLoading ||
            isProductsLoading ||
            isProductRatesLoading ? (
            <div className="p-6 text-center text-muted-foreground">
              Loading distributor product rates...
            </div>
          ) : isProductLinksError ||
            isProductsError ||
            isProductRatesError ? (
            <p className="text-sm text-destructive">
              Failed to load distributor product rates.
            </p>
          ) : (
            <DistributorProductRatesSection
              productLinks={productLinks.filter(
                (link) =>
                  link.distributor_id === selectedDistributorId,
              )}
              productRates={productRates}
              products={products}
            />
          )}
        </>
      )}

      <DistributorModal
        open={isModalOpen}
        distributorId={editingId}
        onOpenChange={setIsModalOpen}
      />
    </div>
  );
}