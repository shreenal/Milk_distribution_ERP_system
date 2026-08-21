import { Badge } from "@/shared/components/ui/badge";

import { MasterSection } from "../../shared/components/MasterSection";

import { ConfigurationStatusBadge } from "./ConfigurationStatusBadge";
import DistributorRatesTable from "./DistributorRatesTable";
import { ProcurementRulesSection } from "./ProcurementRulesSection";
import { ProductLinksSection } from "./ProductLinksSection";
import { ProductRatesTable } from "./ProductRatesTable";
import { TrayConfigurationSection } from "./TrayConfigurationSection";

import type { ProductConfiguration } from "../types/products.types";

interface ProductConfigurationViewProps {
  configuration: ProductConfiguration;
  isLoading?: boolean;
}

export function ProductConfigurationView({
  configuration,
  isLoading = false,
}: ProductConfigurationViewProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading configuration...
      </div>
    );
  }

  const {
    master_brand,
    master_product_group,
    product_links,
    procurement_rules,
  } = configuration;

  return (
    <div className="space-y-6">
      <MasterSection title="Configuration Status">
        <ConfigurationStatusBadge
          configuration={configuration}
          showDetails
        />
      </MasterSection>

      <MasterSection title="Product Master Data">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Product Code
            </p>
            <p className="font-mono font-medium">
              {configuration.code}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Brand
            </p>
            <p className="font-medium">
              {master_brand.name}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Product Group
            </p>
            <p className="font-medium">
              {master_product_group.name}

              <Badge
                variant="secondary"
                className="ml-2"
              >
                {master_product_group.category}
              </Badge>
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Product Type
            </p>
            <p className="font-medium">
              {configuration.master_product_type?.name || "—"}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              Packaging
            </p>
            <p className="font-medium">
              {configuration.packaging_size}{" "}
              {configuration.packaging_unit}

              {configuration.master_packaging_type &&
                ` (${configuration.master_packaging_type.name})`}
            </p>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              GST
            </p>
            <p className="font-medium">
              {configuration.gst_percentage}%

              {configuration.is_gst_inclusive &&
                " (Inclusive)"}
            </p>
          </div>
        </div>
      </MasterSection>

      <ProcurementRulesSection
        product={configuration}
        procurementRules={procurement_rules}
      />

      <ProductLinksSection
        productId={configuration.id}
        productLinks={product_links}
      />

      <DistributorRatesTable
        productId={configuration.id}
        productLinks={product_links}
      />

      <ProductRatesTable
        productId={configuration.id}
        productLinks={product_links}
      />

      <TrayConfigurationSection
        product={configuration}
        trayRules={master_product_group.product_tray_rule}
      />
    </div>
  );
}