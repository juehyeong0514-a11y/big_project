const sessionTokenKey = "dcvp_session_token";

export const sessionTokenStore = {
  get(): string | undefined {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage.getItem(sessionTokenKey) ?? undefined;
  },
  set(token: string): void {
    sessionStorage.setItem(sessionTokenKey, token);
  },
  remove(): void {
    sessionStorage.removeItem(sessionTokenKey);
  }
};
