import { useMutation, useQueryClient } from "@tanstack/react-query";

import { distributorProcurementRulesApi } from "../api/distributor-procurement-rules.api";

export function useDeleteProcurementRule(
  distributorId: number,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      distributorProcurementRulesApi.delete(id),

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