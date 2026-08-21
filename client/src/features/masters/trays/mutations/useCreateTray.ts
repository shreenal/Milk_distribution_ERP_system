import { useMutation, useQueryClient } from "@tanstack/react-query";

import { traysApi } from "../api/trays.api";
import type { CreateTrayTypeInput } from "../types/trays.types";

export function useCreateTray() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTrayTypeInput) =>
      traysApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["trays"],
      });

      queryClient.invalidateQueries({
        queryKey: ["trays-active"],
      });
    },
  });
}