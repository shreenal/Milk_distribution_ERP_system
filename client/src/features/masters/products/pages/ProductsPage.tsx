import { useState } from "react";

import { useProducts } from "../queries/useProducts";
import { useProductConfiguration } from "../queries/useProducts";

import { Button } from "@/shared/components/ui/button";
import { Plus } from "lucide-react";

import { MasterPageHeader } from "../../shared/components/MasterPageHeader";
import { MasterSearch } from "../../shared/components/MasterSearch";
import ProductsTable from "../components/ProductsTable";
import ProductModal from "../components/ProductModal";
import { ProductConfigurationView } from "../components/ProductConfigurationView";
import { MasterSection } from "../../shared/components";

export default function ProductsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<number | null>(null);
  const [configurationProductId, setConfigurationProductId] =
    useState<number | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useProducts();

  const {
    data: configuration,
    isLoading: isConfigurationLoading,
    error: configurationError,
  } = useProductConfiguration(configurationProductId);

  const filteredProducts = (data ?? []).filter((product) => {
    const query = search.toLowerCase();

    return (
      product.code.toLowerCase().includes(query) ||
      String(product.brand_id).includes(query)
    );
  });

  const handleOpenModal = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleEditProduct = (id: number) => {
    setEditingProduct(id);
    setIsModalOpen(true);
  };

  const handleViewConfiguration = (id: number) => {
    setConfigurationProductId(id);
  };

  const handleCloseConfiguration = () => {
    setConfigurationProductId(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  return (
    <div className="space-y-6 p-6">
      <MasterPageHeader
        title="Products"
        description="Manage product catalog"
        action={
          <Button onClick={handleOpenModal}>
            Add Product
          </Button>
        }
      />

      <MasterSearch
        value={search}
        onChange={setSearch}
        placeholder="Search products..."
      />

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground">
          Loading products...
        </div>
      ) : error ? (
        <div className="p-6 text-center text-destructive">
          Error loading products
        </div>
      ) : (
        <ProductsTable
          products={filteredProducts}
          onEdit={handleEditProduct}
          onViewConfiguration={handleViewConfiguration}
          onDelete={() => {
            // Refresh list after delete
          }}
        />
      )}

      {configurationProductId !== null && (
        <MasterSection
          title="Product Configuration"
          description={configuration?.code}
          action={
            <Button
              variant="outline"
              onClick={handleCloseConfiguration}
            >
              Close
            </Button>
          }
        >
          {isConfigurationLoading ? (
            <div className="p-6 text-center text-muted-foreground">
              Loading configuration...
            </div>
          ) : configurationError ? (
            <div className="p-6 text-center text-destructive">
              Error loading product configuration
            </div>
          ) : configuration ? (
            <ProductConfigurationView
              configuration={configuration}
            />
          ) : null}
        </MasterSection>
      )}

      <ProductModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        productId={editingProduct}
      />
    </div>
  );
}