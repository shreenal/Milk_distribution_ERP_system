import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TrayRulesApi } from "../api/tray-rules.api";
import type { UpdateTrayRuleRequest } from "../types/trays.types";

export function useUpdateTrayRule() {
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
        queryKey: ["tray-rules"],
      });
    },
  });
}