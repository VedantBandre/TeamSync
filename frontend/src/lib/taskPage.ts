import { useEffect, useRef, useState } from "react";
import { ApiError, request } from "./api";
import { useAutoRefresh, useDebouncedValue } from "./autoRefresh";
import type { DueFilter } from "./taskFilters";
import type { Page, Task, TaskSummary } from "./types";

export function taskParams(
  project: number,
  filters: {
    query: string;
    assignee: string;
    due: DueFilter;
    priority: string;
  },
  now = new Date(),
) {
  const params = new URLSearchParams({ project: String(project) });
  if (filters.query.trim()) params.set("search", filters.query.trim());
  if (filters.assignee !== "all") params.set("assignee", filters.assignee);
  if (filters.priority !== "all") params.set("priority", filters.priority);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  if (filters.due === "none") params.set("no_due_date", "true");
  else if (filters.due !== "all") {
    params.set("incomplete", "true");
    if (filters.due === "overdue") params.set("due_before", now.toISOString());
    else {
      end.setDate(end.getDate() + (filters.due === "today" ? 1 : 7));
      params.set(
        "due_from",
        (filters.due === "today" ? start : now).toISOString(),
      );
      params.set("due_before", end.toISOString());
    }
  }
  return params;
}
const emptyCounts = { total: 0, TODO: 0, IN_PROGRESS: 0, DONE: 0 };
const emptySummary: TaskSummary = {
  all: emptyCounts,
  filtered: emptyCounts,
  revision: 0,
};
const emptyPage: Page<Task> = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

export function useTaskPage(
  projectId: number | undefined,
  filters: {
    query: string;
    assignee: string;
    due: DueFilter;
    priority: string;
  },
  revision: number,
  paused: boolean,
) {
  const query = useDebouncedValue(filters.query);
  const filterKey = JSON.stringify([
    projectId,
    query,
    filters.assignee,
    filters.due,
    filters.priority,
  ]);
  const [selected, setSelected] = useState({ key: "", page: 1 });
  if (selected.key !== filterKey) setSelected({ key: filterKey, page: 1 });
  const pageNumber = selected.key === filterKey ? selected.page : 1;
  const key = `${filterKey}:${pageNumber}:${revision}`;
  const [result, setResult] = useState({
    key: "",
    page: emptyPage,
    summary: emptySummary,
  });
  const [failure, setFailure] = useState<{
    key: string;
    value: unknown;
  } | null>(null);
  const [notice, setNotice] = useState<{
    projectId: number;
    value: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  const pendingRequest = useRef<AbortController | null>(null);
  async function load(silent = false) {
    if (!projectId) return;
    if (silent && pendingRequest.current) return;
    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;
    const id = ++sequence.current;
    const params = taskParams(projectId, { ...filters, query });
    const summaryParams = params.toString();
    params.set("page", String(pageNumber));
    try {
      const [page, summary] = await Promise.all([
        request<Page<Task>>(`/tasks/?${params}`, { signal: controller.signal }),
        request<TaskSummary>(`/tasks/summary/?${summaryParams}`, {
          signal: controller.signal,
        }),
      ]);
      if (id !== sequence.current) return;
      if (
        !Array.isArray(page?.results) ||
        !Number.isInteger(page.count) ||
        !summary?.all ||
        !summary.filtered ||
        !Number.isInteger(summary.revision)
      )
        throw new ApiError(502, {
          detail:
            "The server returned an unexpected task response. Please try again.",
        });
      if (
        silent &&
        result.key === key &&
        (JSON.stringify(result.page.results) !== JSON.stringify(page.results) ||
          result.page.count !== page.count ||
          result.summary.revision !== summary.revision)
      )
        setNotice({
          projectId,
          value: "New updates are available on this board.",
        });
      setResult({ key, page, summary });
      setFailure(null);
    } catch (failure) {
      if (id !== sequence.current) return;
      // A deletion may remove the last page. Return to page one, not an empty
      // inaccessible page; the project summary also confirms project access.
      if (
        pageNumber > 1 &&
        failure instanceof Error &&
        "status" in failure &&
        failure.status === 404
      ) {
        setSelected({ key: filterKey, page: 1 });
        return;
      }
      setFailure({ key, value: failure });
      throw failure;
    } finally {
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  }
  const loadLatest = useRef(load);
  useEffect(() => {
    loadLatest.current = load;
  });
  useEffect(() => {
    const counter = sequence;
    const pending = pendingRequest;
    void loadLatest.current().catch(() => {});
    return () => {
      counter.current++;
      pending.current?.abort();
    };
  }, [key, retry]);
  useAutoRefresh(() => load(true), !!projectId && !paused);
  const current = result.key === key;
  const error = failure?.key === key ? failure.value : null;
  return {
    page: current ? result.page : emptyPage,
    summary: current ? result.summary : emptySummary,
    loading: !!projectId && !current && !error,
    error,
    notice: notice && notice.projectId === projectId ? notice.value : "",
    pageNumber,
    dismissNotice: () => setNotice(null),
    retry: () => setRetry((value) => value + 1),
    selectPage: (page: number) => setSelected({ key: filterKey, page }),
  };
}
