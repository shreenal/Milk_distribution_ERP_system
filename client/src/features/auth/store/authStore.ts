import type { User } from "@/features/auth/types/auth.types";
import { create } from "zustand";
import { authApi } from "@/features/auth/api/auth.api"
import { persist } from "zustand/middleware";
import { http } from "@/shared/api/http";

interface AuthState {
  accessToken: string | null;
  user: User | null;

  isAuthenticated: boolean;

  login: (username: string, password: string) => Promise<void>;
  logout: () => void;

  setAccessToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
  accessToken: null,
  user: null,

  isAuthenticated: false,

  login: async (username, password) => {
  const response = await authApi.login({
    username,
    password,
  });

  const { accessToken, user } = response.data;

  http.defaults.headers.common.Authorization =
    `Bearer ${accessToken}`;

  set({
    accessToken,
    user,
    isAuthenticated: true,
  });
},

  logout: () => {
  delete http.defaults.headers.common.Authorization;

  set({
    accessToken: null,
    user: null,
    isAuthenticated: false,
  });
},

  setAccessToken: (token) =>
    set({
      accessToken: token,
    }),

    setUser: (user) =>
    set({
      user,
    }),
    }),
    {
      name: "auth-storage",
    }
  )
);