import { useQuery } from "@tanstack/react-query";

import { distributorProcurementRulesApi } from "../api/distributor-procurement-rules.api";

export function useDistributorProcurementRules(
  distributorId: number | null,
) {
  return useQuery({
    queryKey: [
      "distributor-procurement-rules",
      distributorId,
    ],
    queryFn: async () => {
      const rules =
        await distributorProcurementRulesApi.getAll();

      return rules.filter(
        (rule) =>
          rule.distributor_id === distributorId,
      );
    },
    enabled: distributorId !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}