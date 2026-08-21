import { ProductConfigurationStatus } from '../modules/masters/products/products/products.constants.js';

export interface ProductConfigurationStatusDetail {
  status: ProductConfigurationStatus;

  distributorConfigured: boolean;
  distributorRatesConfigured: boolean;
  clientRatesConfigured: boolean;

  activeDistributorCount: number;
  missingDistributorRates: number;

  /**
   * This cannot currently be determined without
   * knowing which clients are expected to receive this product.
   */
  missingClientRates: number;

  issues: string[];
}