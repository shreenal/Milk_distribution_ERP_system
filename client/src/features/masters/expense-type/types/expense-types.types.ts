export interface ExpenseType {
  id: number;
  name: string;
  is_active: boolean;
}

export interface CreateExpenseTypeRequest {
  name: string;
  is_active?: boolean;
}

export interface UpdateExpenseTypeRequest {
  name?: string;
  is_active?: boolean;
}

export type ExpenseTypesListResponse = ExpenseType[];