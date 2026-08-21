export interface LoginRequest {
  username: string;
  password: string;
}

export interface User {
  id: number;
  username: string;
  role: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export type MeResponse = User;