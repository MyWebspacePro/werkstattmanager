// API-Client.
// Access-Token: nur im Speicher (kein localStorage) -> bei XSS ist nach einem
// Reload nichts zu stehlen, und das Token ist nach 15 Minuten ohnehin tot.
// Refresh-Token: httpOnly-Cookie beim Server, wird vom Browser automatisch
// mitgeschickt und ist fuer JavaScript nicht lesbar.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearTokens(): void {
  accessToken = null;
}

export class ApiError extends Error {
  status: number;
  details?: string[];
  canOverride?: boolean; // Backend signalisiert: Chef darf diese Sperre übersteuern
  constructor(status: number, message: string, details?: string[], canOverride?: boolean) {
    super(message);
    this.status = status;
    this.details = details;
    this.canOverride = canOverride;
  }
}

async function refreshAccess(): Promise<boolean> {
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include", // Refresh-Cookie mitschicken
  });
  if (!res.ok) return false;
  const data = await res.json();
  setAccessToken(data.accessToken);
  return true;
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const access = getAccessToken();
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
    // Nur umleiten, wenn wir nicht schon auf /login sind. Sonst:
    // /auth/me scheitert -> Redirect auf /login -> Seite lädt neu ->
    // AuthProvider prüft erneut -> Redirect ... (flackernde Endlosschleife).
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Sitzung abgelaufen");
  }

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, isJson ? body.error : "Request fehlgeschlagen", isJson ? body.details : undefined, isJson ? body.canOverride : undefined);
  }
  return body as T;
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const access = getAccessToken();
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