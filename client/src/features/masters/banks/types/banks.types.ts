export interface Bank {
  id: number;
  name: string;
  is_active: boolean;
}

export interface CreateBankRequest {
  name: string;
  is_active?: boolean;
}

export interface UpdateBankRequest {
  name?: string;
  is_active?: boolean;
}

export type BanksListResponse = Bank[];