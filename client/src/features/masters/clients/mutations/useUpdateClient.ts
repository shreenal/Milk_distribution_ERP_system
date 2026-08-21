import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clientsApi } from "../api/client.api";
import type { UpdateClientRequest } from "../types/client.types";

export function useUpdateClient(id: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateClientRequest) => {
      if (id === null) {
        throw new Error("Client ID is required");
      }

      return clientsApi.update(id, data);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clients"],
      });

      queryClient.invalidateQueries({
        queryKey: ["clients", id],
      });

      queryClient.invalidateQueries({
        queryKey: ["clients-active"],
      });
    },
  });
}