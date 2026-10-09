import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let api: typeof import("./api");
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
const fetchMock = vi.fn<typeof fetch>();
afterEach(() => vi.useRealTimers());

beforeEach(async () => {
  vi.resetModules();
  sessionStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  api = await import("./api");
});

describe("API sessions", () => {
  it("stores login tokens only for the current tab session", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ access: "access", refresh: "refresh" }),
    );
    await api.login("alice", "password");
    expect(api.hasSession()).toBe(true);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ username: "alice", password: "password" }),
    );
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty(
      "Authorization",
    );
    expect(localStorage.length).toBe(0);
  });

  it("refreshes an expired access token and retries the original request", async () => {
    api.setSession({ access: "old", refresh: "refresh" });
    fetchMock
      .mockResolvedValueOnce(response({ detail: "Expired" }, 401))
      .mockResolvedValueOnce(response({ access: "new" }))
      .mockResolvedValueOnce(response({ id: 1 }));
    expect(await api.request("/me/")).toEqual({ id: 1 });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/token/refresh/");
    expect(fetchMock.mock.calls[2][1]?.headers).toHaveProperty(
      "Authorization",
      "Bearer new",
    );
  });

  it("shares one refresh across concurrent requests", async () => {
    api.setSession({ access: "old", refresh: "refresh" });
    let refreshCount = 0;
    fetchMock.mockImplementation(async (path, options) => {
      if (String(path).endsWith("/token/refresh/")) {
        refreshCount++;
        return response({ access: "new" });
      }
      return (options?.headers as Record<string, string>).Authorization ===
        "Bearer old"
        ? response({ detail: "Expired" }, 401)
        : response([]);
    });
    await Promise.all([api.request("/projects/"), api.request("/tasks/")]);
    expect(refreshCount).toBe(1);
  });

  it("clears an invalid refresh session and announces sign-out", async () => {
    api.setSession({ access: "old", refresh: "bad" });
    const listener = vi.fn();
    window.addEventListener("teamsync:signed-out", listener);
    fetchMock
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ detail: "Invalid" }, 401));
    await expect(api.request("/me/")).rejects.toMatchObject({ status: 401 });
    expect(api.hasSession()).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("teamsync:signed-out", listener);
  });

  it("does not restore old tokens after logout or a new login during refresh", async () => {
    api.setSession({ access: "old", refresh: "old-refresh" });
    let resolveRefresh!: (value: Response) => void;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    fetchMock
      .mockResolvedValueOnce(response({}, 401))
      .mockReturnValueOnce(refreshResponse);
    const pending = api.request("/me/");
    const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    api.clearSession();
    api.setSession({ access: "other-user", refresh: "other-refresh" });
    resolveRefresh(response({ access: "stale" }));
    await rejected;
    expect(JSON.parse(sessionStorage.getItem("teamsync.session")!).access).toBe(
      "other-user",
    );
  });

  it("preserves a session if refreshing fails due to a server outage", async () => {
    api.setSession({ access: "old", refresh: "refresh" });
    fetchMock
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ detail: "Unavailable" }, 503));
    await expect(api.request("/me/")).rejects.toMatchObject({ status: 503 });
    expect(api.hasSession()).toBe(true);
  });
});

describe("API errors", () => {
  it("times out a stalled write without automatically submitting it twice", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const pending = api.save("/tasks/", { title: "One write" });
    const rejected = expect(pending).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("refresh first"),
    });
    await vi.advanceTimersByTimeAsync(90000);
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("cancels an obsolete board read without dropping the login session", async () => {
    api.setSession({ access: "access", refresh: "refresh" });
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const controller = new AbortController();
    const pending = api.request("/tasks/?project=1&page=1", {
      signal: controller.signal,
    });
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejected;
    expect(api.hasSession()).toBe(true);
  });
  it("keeps field validation errors available to forms", async () => {
    fetchMock.mockResolvedValue(
      response({ title: ["This field is required."] }, 400),
    );
    await expect(api.save("/tasks/", {})).rejects.toMatchObject({
      status: 400,
      fields: { title: "This field is required." },
    });
  });

  it("reports network errors without exposing internal exceptions", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(api.request("/me/")).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("Could not connect"),
    });
  });

  it("rejects malformed successful responses", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>unexpected</html>", { status: 200 }),
    );
    await expect(api.request("/me/")).rejects.toMatchObject({ status: 502 });
  });

  it("accepts a successful delete with no response body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(
      await api.request("/tasks/1/", { method: "DELETE" }),
    ).toBeUndefined();
  });
});
