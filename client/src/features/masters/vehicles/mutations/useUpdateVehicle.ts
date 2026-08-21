import { useMutation, useQueryClient } from "@tanstack/react-query";

import { vehiclesApi } from "../api/vehicles.api";
import type { UpdateVehicleRequest } from "../types/vehicles.types";

export function useUpdateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateVehicleRequest;
    }) => vehiclesApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["vehicles"],
      });

      queryClient.invalidateQueries({
        queryKey: ["vehicles", variables.id],
      });
    },
  });
}