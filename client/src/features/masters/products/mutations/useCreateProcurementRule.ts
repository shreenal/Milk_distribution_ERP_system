import { useMutation, useQueryClient } from "@tanstack/react-query";
import { distributorProcurementRulesApi } from "../api/distributor-procurement-rules.api";
import type {
  CreateDistributorProcurementRuleRequest,
} from "../types/products.types";

export function useCreateProcurementRule(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDistributorProcurementRuleRequest) =>
      distributorProcurementRulesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}