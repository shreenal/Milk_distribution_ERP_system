import { useMutation, useQueryClient } from "@tanstack/react-query";

import { groupSupplyRulesApi } from "../api/group-supply-rules.api";
import type { CreateGroupSupplyRuleInput } from "../types/groups.types";

export function useCreateGroupSupplyRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateGroupSupplyRuleInput) =>
      groupSupplyRulesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["group-supply-rules"],
      });
    },
  });
}