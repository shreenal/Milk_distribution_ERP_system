import { useMutation, useQueryClient } from "@tanstack/react-query";

import { groupSupplyRulesApi } from "../api/group-supply-rules.api";
import type { UpdateGroupSupplyRuleInput } from "../types/groups.types";

export function useUpdateGroupSupplyRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateGroupSupplyRuleInput;
    }) => groupSupplyRulesApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["group-supply-rules"],
      });

      queryClient.invalidateQueries({
        queryKey: ["group-supply-rules", variables.id],
      });
    },
  });
}