export interface Dairy {
  id: number;
  name: string;
  city: string | null;
  is_active: boolean;
}

export interface CreateDairyRequest {
  name: string;
  city?: string | null;
  is_active?: boolean;
}

export interface UpdateDairyRequest {
  name?: string;
  city?: string | null;
  is_active?: boolean;
}

export type DairiesListResponse = Dairy[];