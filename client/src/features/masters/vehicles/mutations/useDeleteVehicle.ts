import { useMutation, useQueryClient } from "@tanstack/react-query";

import { vehiclesApi } from "../api/vehicles.api";

export function useDeleteVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      vehiclesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["vehicles"],
      });
    },
  });
}