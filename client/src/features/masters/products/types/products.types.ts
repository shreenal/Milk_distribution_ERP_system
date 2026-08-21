export interface Product {
  id: number;
  code: string;
  brand_id: number;
  product_group_id: number;
  product_type_id: number | null;
  packaging_type_id: number | null;
  packaging_size: string;
  packaging_unit: string;
  gst_percentage: string;
  is_gst_inclusive: boolean;
  is_active: boolean;
  show_by_default: boolean;
  display_order: number | null;
  created_at: string;
  updated_at: string;
}


export interface MasterBrand {
  id: number;
  name: string;
  is_active: boolean;
  dairy_id: number;
  gatepass_date_policy: "SAME_DAY" | "PREVIOUS_DAY";
  created_at: string;
  updated_at: string;
}

/**
 * Master Product Group - Referenced by Product
 * From: ProductConfiguration.master_product_group
 */
export interface MasterProductGroup {
  id: number;
  name: string;
  category: "MILK" | "NON_MILK"; // SupplyCategory
  created_at: string;
}

/**
 * Product Tray Rule - Maps product to tray types
 * From: ProductConfiguration.master_product_group.product_tray_rule[]
 */
export interface ProductTrayRule {
  id: number;
  product_group_id: number | null;
  brand_id: number | null;
  product_type_id: number | null;
  packaging_type_id: number | null;
  tray_type_id: number;
  applies_to_packaging: boolean;
  is_active: boolean;
  master_tray_type: MasterTrayType;
}

/**
 * Master Tray Type
 * From: ProductConfiguration.master_product_group.product_tray_rule[].master_tray_type
 */
export interface MasterTrayType {
  id: number;
  brand_id: number;
  color: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Master Product Type - Optional reference by Product
 * From: ProductConfiguration.master_product_type (can be null)
 */
export interface MasterProductType {
  id: number;
  brand_id: number;
  name: string;
  created_at: string;
}

/**
 * Master Packaging Type - Optional reference by Product
 * From: ProductConfiguration.master_packaging_type (can be null)
 */
export interface MasterPackagingType {
  id: number;
  name: string;
  created_at: string;
}

/**
 * Distributor Product Rate
 * From: ProductConfiguration.product_links[].distributor_rates[]
 */
export interface DistributorProductRate {
  id: number;
  product_link_id: number;
  purchase_rate: string;
  selling_rate: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}
/**
 * Master Distributor
 * From: ProductConfiguration.product_links[].distributor
 */
export interface MasterDistributor {
  id: number;
  name: string;
  contact: string | null;
  email: string | null;
  is_active: boolean;
}

/**
 * Master Client
 * From: ProductConfiguration.product_links[].client_rates[].master_client
 */
export interface MasterClient {
  id: number;
  code: string | null;
  name: string;
  contact: string | null;
  shop_name: string | null;
  is_active: boolean;
  billing_group_id: number;
  delivery_group_id: number;
  owner_distributor_id: number;
  created_at: string;
  updated_at: string;
}

/**
 * Client Product Rate
 * From: ProductConfiguration.product_links[].client_rates[]
 */
export interface ClientProductRate {
  id: number;
  client_id: number;
  product_link_id: number;
  selling_rate: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  master_client: MasterClient;
}

/**
 * Product Link - Connects product to distributor
 * From: ProductConfiguration.product_links[]
 */
export interface ProductLink {
  id: number;
  distributor_id: number;
  product_id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  distributor: MasterDistributor;
  distributor_rates: DistributorProductRate[];
  client_rates: ClientProductRate[];
}

export interface DistributorProcurementRule {
  id: number;
  distributor_id: number;
  brand_id: number;
  product_group_id: number;
  is_active: boolean;
  category: "MILK" | "NON_MILK";

  master_distributor: MasterDistributor;
  master_brand: MasterBrand;
  master_product_group: MasterProductGroup;
}

/**
 * MAIN: Product Configuration Response
 * Returned from: GET /api/products/:id/configuration
 * 
 * This represents a product with all its operational relationships
 */
export interface ProductConfiguration extends Product {
  master_brand: MasterBrand;
  master_product_group: MasterProductGroup & {
    product_tray_rule: ProductTrayRule[];
  };
  master_product_type: MasterProductType | null;
  master_packaging_type: MasterPackagingType | null;
  procurement_rules: DistributorProcurementRule[];
  product_links: ProductLink[];
  configurationStatus: ConfigurationStatusDetail;
}


export interface CreateProductRequest {
  brand_id: number;
  product_group_id: number;
  product_type_id?: number | null;
  packaging_type_id?: number | null;
  packaging_size: number;
  packaging_unit: string;
  gst_percentage?: number;
  is_gst_inclusive?: boolean;
  is_active?: boolean;
  show_by_default?: boolean;
  display_order?: number | null;
}
export interface CreateProductLinkRequest {
  distributor_id: number;
  product_id: number;
  is_active?: boolean;
}

export interface UpdateProductLinkRequest {
  distributor_id?: number;
  product_id?: number;
  is_active?: boolean;
}

export interface CreateDistributorProductRateRequest {
  product_link_id: number;
  purchase_rate: number;
  selling_rate: number;
  effective_from?: string;
  effective_to?: string;
  is_active?: boolean;
}

export interface UpdateDistributorProductRateRequest {
  product_link_id?: number;
  purchase_rate?: number;
  selling_rate?: number;
  effective_from?: string;
  effective_to?: string;
  is_active?: boolean;
}

export interface CreateClientProductRateRequest {
  client_id: number;
  product_link_id: number;
  selling_rate: number;
  effective_from?: string;
  effective_to?: string;
  is_active?: boolean;
}

export interface UpdateClientProductRateRequest {
  client_id?: number;
  product_link_id?: number;
  selling_rate?: number;
  effective_from?: string;
  effective_to?: string;
  is_active?: boolean;
}


export interface CreateTrayRuleRequest {
  product_group_id?: number;
  brand_id?: number;
  product_type_id?: number;
  packaging_type_id?: number;
  tray_type_id: number;
  applies_to_packaging?: boolean;
  is_active?: boolean;
}

export interface UpdateTrayRuleRequest {
  product_group_id?: number;
  brand_id?: number;
  product_type_id?: number;
  packaging_type_id?: number;
  tray_type_id?: number;
  applies_to_packaging?: boolean;
  is_active?: boolean;
}

export interface CreateDistributorProcurementRuleRequest {
  distributor_id: number;
  brand_id: number;
  product_group_id: number;
  category: "MILK" | "NON_MILK";
  is_active?: boolean;
}

export interface UpdateDistributorProcurementRuleRequest {
  distributor_id?: number;
  brand_id?: number;
  product_group_id?: number;
  category?: "MILK" | "NON_MILK";
  is_active?: boolean;
}

export interface UpdateProductRequest
  extends Partial<CreateProductRequest> {}

export type ProductsListResponse = Product[];

export interface ProductsQueryParams {
  skip?: number;
  take?: number;
  search?: string;
}

export type ConfigurationStatus =
  | "READY"
  | "PARTIAL"
  | "UNCONFIGURED";


export interface ConfigurationStatusDetail {
  status: ConfigurationStatus;
  distributorConfigured: boolean; // Has ≥1 active product_link
  distributorRatesConfigured: boolean; // Has ≥1 active distributor rate per link
  clientRatesConfigured: boolean; // Has ≥1 active client rate
  activeDistributorCount: number; // Count of active product_links
  missingDistributorRates: number; // Links without active rates
  missingClientRates: number; // How many clients missing rates
  issues: string[]; // List of configuration issues
}

/**
 * Date-aware rate wrapper
 * Indicates if a rate is currently applicable
 */
export interface RateWithApplicability<T> {
  rate: T;
  isCurrent: boolean; // effective_from <= today < effective_to
  isExpired: boolean; // effective_to < today
  isFuture: boolean; // effective_from > today
}