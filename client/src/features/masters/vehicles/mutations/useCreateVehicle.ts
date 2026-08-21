import { useMutation, useQueryClient } from "@tanstack/react-query";

import { vehiclesApi } from "../api/vehicles.api";
import type { CreateVehicleRequest } from "../types/vehicles.types";

export function useCreateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateVehicleRequest) =>
      vehiclesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["vehicles"],
      });
    },
  });
}