import { http } from "@/shared/api/http";
import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
} from "@/features/auth/types/auth.types";

export const authApi = {
  login(data: LoginRequest) {
    return http.post<LoginResponse>("api/auth/login", data);
  },

  me() {
    return http.get<MeResponse>("api/auth/me");
  },
};