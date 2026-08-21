export interface Employee {
  id: number;
  name: string;
  contact: string | null;
  is_active: boolean;
}

export interface CreateEmployeeRequest {
  name: string;
  contact?: string | null;
  is_active?: boolean;
}

export interface UpdateEmployeeRequest {
  name?: string;
  contact?: string | null;
  is_active?: boolean;
}

export type EmployeesListResponse = Employee[];