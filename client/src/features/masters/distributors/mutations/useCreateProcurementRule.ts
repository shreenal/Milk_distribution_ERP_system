import { useMutation, useQueryClient } from "@tanstack/react-query";

import { distributorProcurementRulesApi } from "../api/distributor-procurement-rules.api";

import type {
  CreateDistributorProcurementRuleRequest,
} from "../types/distributors.types";

export function useCreateProcurementRule(
  distributorId: number,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      data: CreateDistributorProcurementRuleRequest,
    ) => distributorProcurementRulesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          "distributor-procurement-rules",
          distributorId,
        ],
      });
    },
  });
}