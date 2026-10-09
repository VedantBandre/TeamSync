import type { WorkspaceData } from "./types";
import { trackConnection } from "./connection";

interface Tokens {
  access: string;
  refresh: string;
}
const storageKey = "teamsync.session";
const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
let generation = 0;
let refreshing: Promise<string> | null = null;

function readTokens(): Tokens | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    return typeof value?.access === "string" &&
      typeof value?.refresh === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function hasSession() {
  return Boolean(readTokens());
}
export function setSession(tokens: Tokens) {
  generation++;
  refreshing = null;
  sessionStorage.setItem(storageKey, JSON.stringify(tokens));
}
export function clearSession() {
  generation++;
  refreshing = null;
  sessionStorage.removeItem(storageKey);
  window.dispatchEvent(new Event("teamsync:signed-out"));
}

function describe(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(describe).join(" ");
  if (value && typeof value === "object")
    return Object.values(value).map(describe).join(" ");
  return "";
}

export class ApiError extends Error {
  readonly fields: Record<string, string>;
  constructor(
    readonly status: number,
    data: unknown,
  ) {
    const fields =
      data && typeof data === "object" && !Array.isArray(data)
        ? Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, describe(value)]),
          )
        : {};
    super(
      fields.detail ||
        fields.non_field_errors ||
        describe(data) ||
        "Something went wrong. Please try again.",
    );
    this.fields = fields;
  }
}

async function decode(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    if (response.ok)
      throw new ApiError(502, {
        detail: "The server returned an unexpected response.",
      });
    return { detail: "The server is unavailable. Please try again." };
  }
}

async function send(path: string, options: RequestInit = {}, token?: string) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = window.setTimeout(cancel, 90000);
  const stopTracking = trackConnection();
  try {
    return await fetch(`${base}${path}`, {
      ...options,
      signal: controller.signal,
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    if (options.signal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    throw new ApiError(0, {
      detail: controller.signal.aborted
        ? "The server took too long to respond. Try again. If you were saving, refresh first to check whether it was saved."
        : "Could not connect. Check your connection and try again.",
    });
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    stopTracking();
  }
}

async function refreshToken(): Promise<string> {
  if (refreshing) return refreshing;
  const sessionGeneration = generation;
  const tokens = readTokens();
  if (!tokens) throw new ApiError(401, { detail: "Please sign in again." });
  const operation = (async () => {
    const response = await send("/token/refresh/", {
      method: "POST",
      body: JSON.stringify({ refresh: tokens.refresh }),
    });
    const data = (await decode(response)) as Partial<Tokens> | undefined;
    if (generation !== sessionGeneration)
      throw new ApiError(401, {
        detail: "Your session has changed. Please sign in again.",
      });
    if (!response.ok || !data?.access) {
      if (response.status === 400 || response.status === 401) clearSession();
      throw new ApiError(response.status, data);
    }
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        access: data.access,
        refresh: data.refresh || tokens.refresh,
      }),
    );
    return data.access;
  })();
  refreshing = operation;
  try {
    return await operation;
  } finally {
    if (refreshing === operation) refreshing = null;
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const sessionGeneration = generation;
  const tokens = authenticated ? readTokens() : null;
  let response = await send(path, options, tokens?.access);
  if (
    response.status === 401 &&
    authenticated &&
    tokens &&
    generation === sessionGeneration
  ) {
    const access = await refreshToken();
    response = await send(path, options, access);
  }
  if (authenticated && generation !== sessionGeneration)
    throw new ApiError(401, { detail: "Your session has changed." });
  const data = await decode(response);
  if (!response.ok) {
    if (
      response.status === 401 &&
      authenticated &&
      generation === sessionGeneration
    )
      clearSession();
    throw new ApiError(response.status, data);
  }
  return data as T;
}

export async function login(username: string, password: string) {
  const tokens = await request<Tokens>(
    "/token/",
    { method: "POST", body: JSON.stringify({ username, password }) },
    false,
  );
  setSession(tokens);
}

export async function loadWorkspace(): Promise<WorkspaceData> {
  const [organizations, memberships, projects] = await Promise.all([
    request<WorkspaceData["organizations"]>("/organizations/"),
    request<WorkspaceData["memberships"]>("/memberships/"),
    request<WorkspaceData["projects"]>("/projects/"),
  ]);
  return { organizations, memberships, projects, tasks: [] };
}

export function save<T>(path: string, payload: unknown, method = "POST") {
  return request<T>(path, { method, body: JSON.stringify(payload) });
}

export async function logout() {
  await request("/logout/", { method: "POST" });
  clearSession();
}
