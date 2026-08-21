import { useQuery } from "@tanstack/react-query";

import { expenseTypesApi } from "../api/expense-types.api";

export function useExpenseTypes() {
  return useQuery({
    queryKey: ["expense-types"],
    queryFn: expenseTypesApi.getAll,
  });
}

export function useActiveExpenseTypes() {
  return useQuery({
    queryKey: ["expense-types", "active"],
    queryFn: expenseTypesApi.getActive,
  });
}

export function useExpenseTypeById(id: number | null) {
  return useQuery({
    queryKey: ["expense-types", id],
    queryFn: () => expenseTypesApi.getById(id!),
    enabled: id !== null,
  });
}