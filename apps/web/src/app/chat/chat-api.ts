export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/, "");

let refreshRequest: Promise<boolean> | null = null;

export async function refreshChatSession() {
  if (!refreshRequest) {
    refreshRequest = fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((response) => response.ok)
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export async function chatRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const request = () =>
  fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  let response = await request();
  if (
  response.status === 401 &&
  path !== "/auth/refresh" &&
  (await refreshChatSession())
  ) {
  response = await request();
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const error = (await response.json()) as { message?: string | string[] };
      message = Array.isArray(error.message)
        ? error.message.join(", ")
        : (error.message ?? message);
    } catch {
      message = `Request failed (${response.status})`;
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
