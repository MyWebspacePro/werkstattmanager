// API-Client mit Token-Verwaltung und automatischem Refresh.
const TOKEN_KEY = "wm_access";
const REFRESH_KEY = "wm_refresh";

export function getTokens() {
  return {
    access: localStorage.getItem(TOKEN_KEY),
    refresh: localStorage.getItem(REFRESH_KEY),
  };
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  status: number;
  details?: string[];
  constructor(status: number, message: string, details?: string[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function refreshAccess(): Promise<boolean> {
  const { refresh } = getTokens();
  if (!refresh) return false;
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  setTokens(data.accessToken);
  return true;
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const { access } = getTokens();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && retry) {
    if (await refreshAccess()) {
      return api<T>(path, options, false);
    }
    clearTokens();
    window.location.href = "/login";
    throw new ApiError(401, "Sitzung abgelaufen");
  }

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, isJson ? body.error : "Request fehlgeschlagen", isJson ? body.details : undefined);
  }
  return body as T;
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const { access } = getTokens();
  const res = await fetch(`/api${path}`, { headers: access ? { Authorization: `Bearer ${access}` } : {} });
  if (!res.ok) throw new ApiError(res.status, "Download fehlgeschlagen");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
