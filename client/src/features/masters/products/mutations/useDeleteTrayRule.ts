import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TrayRulesApi } from "../api/tray-rules.api";

export function useDeleteTrayRule(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => TrayRulesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}