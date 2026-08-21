import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clientsApi } from "../api/client.api";
import type { CreateClientRequest } from "../types/client.types";

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateClientRequest) =>
      clientsApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clients"],
      });

      queryClient.invalidateQueries({
        queryKey: ["clients-active"],
      });
    },
  });
}