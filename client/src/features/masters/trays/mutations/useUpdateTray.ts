import { useMutation, useQueryClient } from "@tanstack/react-query";

import { traysApi } from "../api/trays.api";
import type { UpdateTrayTypeInput } from "../types/trays.types";

interface UpdateTrayVariables {
  id: number;
  data: UpdateTrayTypeInput;
}

export function useUpdateTray() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: UpdateTrayVariables) =>
      traysApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["trays"],
      });

      queryClient.invalidateQueries({
        queryKey: ["trays-active"],
      });

      queryClient.invalidateQueries({
        queryKey: ["trays", variables.id],
      });
    },
  });
}