import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TrayRulesApi } from "../api/tray-rules.api";
import type {
  UpdateTrayRuleRequest,
} from "../types/products.types";

export function useUpdateTrayRule(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateTrayRuleRequest;
    }) => TrayRulesApi.update(id, data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}