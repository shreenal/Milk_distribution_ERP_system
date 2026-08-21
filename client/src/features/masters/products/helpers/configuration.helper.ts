import type {
  ProductConfiguration,
} from "../types/products.types";

/**
 * Infer configuration status from product configuration object
 * 
 * Rules (pending backend clarification):
 * - READY: Has ≥1 active product_link AND ≥1 active distributor_rate
 * - PARTIAL: Has product_links but missing rates or some are inactive
 * - UNCONFIGURED: No product_links or all inactive
 */
// export function getProductConfigurationStatus(
//   config: ProductConfiguration
// ): ConfigurationStatusDetail {
//   const issues: string[] = [];

//   // Check distributor configuration
//   const activeLinks = config.product_links.filter((link) => link.is_active);

//   if (activeLinks.length === 0) {
//     issues.push("No distributor configured for this product");
//     return {
//       status: "UNCONFIGURED",
//       distributorConfigured: false,
//       distributorRatesConfigured: false,
//       clientRatesConfigured: false,
//       activeDistributorCount: 0,
//       missingDistributorRates: 0,
//       missingClientRates: 0,
//       issues,
//     };
//   }

//   // Check distributor rates
//   let missingDistributorRates = 0;
//   let distributorRatesConfigured = true;

//   for (const link of activeLinks) {
//     const hasActiveRate = link.distributor_rates.some(
//       (rate) => rate.is_active
//     );
//     if (!hasActiveRate) {
//       missingDistributorRates++;
//       distributorRatesConfigured = false;
//       issues.push(
//         `Distributor "${link.distributor.name}" has no active purchase/selling rates`
//       );
//     }
//   }

//   // Check client rates
//   let clientRatesConfigured = false;
//   let missingClientRates = 0;

//   for (const link of activeLinks) {
//     const activeClientRates = link.client_rates.filter(
//       (rate) => rate.is_active
//     );
//     if (activeClientRates.length > 0) {
//       clientRatesConfigured = true;
//     } else if (link.is_active) {
//       missingClientRates++;
//       issues.push(
//         `Product link for distributor "${link.distributor.name}" has no client rates`
//       );
//     }
//   }

//   // Infer status
//   let status: ConfigurationStatus = "READY";
//   if (!distributorRatesConfigured) {
//     status = "PARTIAL";
//     issues.push("Some distributors lack active purchase/selling rates");
//   }
//   if (!clientRatesConfigured && activeLinks.length > 0) {
//     status = "PARTIAL";
//     if (!issues.includes("No active client rates configured"))
//       issues.push("No active client rates configured");
//   }

//   return {
//     status,
//     distributorConfigured: activeLinks.length > 0,
//     distributorRatesConfigured,
//     clientRatesConfigured,
//     activeDistributorCount: activeLinks.length,
//     missingDistributorRates,
//     missingClientRates,
//     issues,
//   };
// }

/**
 * Check if a rate is currently applicable
 * by comparing effective_from/effective_to with today
 */
export function isRateCurrent(
  effectiveFrom: string,
  effectiveTo: string | null
): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const from = new Date(effectiveFrom);
  from.setHours(0, 0, 0, 0);

  const to = effectiveTo ? new Date(effectiveTo) : null;
  if (to) {
    to.setHours(0, 0, 0, 0);
  }

  return from <= today && (!to || today < to);
}

/**
 * Check if a rate has expired
 */
export function isRateExpired(effectiveTo: string | null): boolean {
  if (!effectiveTo) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const to = new Date(effectiveTo);
  to.setHours(0, 0, 0, 0);

  return today >= to;
}

/**
 * Check if a rate is in the future
 */
export function isRateFuture(effectiveFrom: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const from = new Date(effectiveFrom);
  from.setHours(0, 0, 0, 0);

  return from > today;
}

/**
 * Format a date for display (YYYY-MM-DD)
 */
export function formatDateForDisplay(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Get configuration summary as text
 * Useful for displaying in list view
 */
export function getConfigurationSummary(
  config: ProductConfiguration
): string {
  const status = config.configurationStatus;

  if (status.status === "UNCONFIGURED") {
    return "Not configured";
  }

  const parts: string[] = [];
  parts.push(`${status.activeDistributorCount} distributor(s)`);

  if (status.distributorRatesConfigured) {
    parts.push("rates configured");
  } else {
    parts.push(`${status.missingDistributorRates} missing rates`);
  }

  if (status.clientRatesConfigured) {
    parts.push("client rates set");
  }

  return parts.join(" • ");
}