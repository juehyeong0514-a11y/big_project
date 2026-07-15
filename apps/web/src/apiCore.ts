function getDevelopmentApiBaseUrl() {
  if (typeof window === "undefined") return "http://localhost:4000";

  const { hostname, protocol } = window.location;
  return `${protocol}//${hostname}:4000`;
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? getDevelopmentApiBaseUrl();

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function request<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const storedToken = typeof localStorage === "undefined" ? undefined : localStorage.getItem("dcvp_session_token") ?? undefined;
  const token = init?.token ?? storedToken;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new ApiRequestError(response.status, await responseErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function responseErrorMessage(response: Response) {
  const fallback = `API 요청 실패 (${response.status})`;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body: unknown = await response.json().catch(() => undefined);
    if (isRecord(body)) {
      const message = body["message"];
      if (Array.isArray(message)) {
        return message.join(", ");
      }
      if (typeof message === "string" && message.trim()) {
        return message;
      }
      const error = body["error"];
      if (typeof error === "string" && error.trim()) {
        return error;
      }
    }
    return fallback;
  }

  const text = await response.text().catch(() => "");
  return text.trim() || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
