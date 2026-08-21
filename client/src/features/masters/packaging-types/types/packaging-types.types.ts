export interface PackagingType {
  id: number;
  name: string;
}

export interface CreatePackagingTypeRequest {
  name: string;
}

export interface UpdatePackagingTypeRequest {
  name?: string;
}

export type PackagingTypesListResponse = PackagingType[];