import { useQuery } from "@tanstack/react-query";
import { productsApi } from "../api/products.api";
import type { ProductsQueryParams } from "../types/products.types";

export function useProducts(params?: ProductsQueryParams) {
  return useQuery({
    queryKey: ["products", params?.skip, params?.take, params?.search],
    queryFn: () => productsApi.getAll(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes (was cacheTime)
  });
}

export function useProductsActive() {
  return useQuery({
    queryKey: ["products-active"],
    queryFn: () => productsApi.getActive(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useProductById(id: number | null) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: () => productsApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useProductConfiguration(id: number | null) {
  return useQuery({
    queryKey: ["product-configuration", id],
    queryFn: () => productsApi.getConfiguration(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}