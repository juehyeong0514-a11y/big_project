import type { AuthSession, ChangePasswordInput, CreateInitialAdminInput, LoginInput, RegisterInput, SetupStatus } from "@dcvp/shared";
import { request } from "./apiCore";

export const authApi = {
  login: (input: LoginInput) =>
    request<AuthSession>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  register: (input: RegisterInput) =>
    request<AuthSession>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  setupStatus: () => request<SetupStatus>("/api/auth/setup"),
  createInitialAdmin: (input: CreateInitialAdminInput) =>
    request<AuthSession>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  changePassword: (token: string, input: ChangePasswordInput) =>
    request<AuthSession>("/api/auth/change-password", {
      method: "POST",
      token,
      body: JSON.stringify(input)
    }),
  me: (token: string) => request<AuthSession>("/api/auth/me", { token }),
  logout: (token: string) =>
    request<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
      token
    })
};
