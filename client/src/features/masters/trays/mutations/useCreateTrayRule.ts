import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TrayRulesApi } from "../api/tray-rules.api";
import type { CreateTrayRuleRequest } from "../types/trays.types";

export function useCreateTrayRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTrayRuleRequest) =>
      TrayRulesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tray-rules"],
      });
    },
  });
}