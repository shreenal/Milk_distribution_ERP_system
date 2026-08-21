import { useMutation, useQueryClient } from "@tanstack/react-query";
import { distributorProcurementRulesApi } from "../api/distributor-procurement-rules.api";
import type {
  UpdateDistributorProcurementRuleRequest,
} from "../types/products.types";

export function useUpdateProcurementRule(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateDistributorProcurementRuleRequest;
    }) => distributorProcurementRulesApi.update(id, data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}