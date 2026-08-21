import { useQuery } from "@tanstack/react-query";

import { employeesApi } from "../api/employees.api";

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: employeesApi.getAll,
  });
}

export function useActiveEmployees() {
  return useQuery({
    queryKey: ["employees", "active"],
    queryFn: employeesApi.getActive,
  });
}

export function useEmployeeById(id: number | null) {
  return useQuery({
    queryKey: ["employees", id],
    queryFn: () => employeesApi.getById(id!),
    enabled: id !== null,
  });
}