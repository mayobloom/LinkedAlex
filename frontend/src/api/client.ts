import type { GraphResponse, GraphSettings, SearchResponse, UsageState } from '../types/api';
import { useUsageStore } from '../store/usageStore';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body || `Request failed with ${response.status}`;
    try {
      const parsed = JSON.parse(body) as { detail?: unknown };
      if (typeof parsed.detail === 'string') {
        message = parsed.detail;
      }
    } catch {
      // Keep the raw response body when the server does not return JSON.
    }
    throw new Error(message || `Request failed with ${response.status}`);
  }

  const data = (await response.json()) as T & { usage?: UsageState };
  if (data.usage) {
    useUsageStore.getState().setUsage(data.usage);
  }
  return data;
}

export function fetchUsage() {
  return request<UsageState>('/api/usage').then((usage) => {
    useUsageStore.getState().setUsage(usage);
    return usage;
  });
}

export function fetchGraph(input: { doi: string; settings: GraphSettings }) {
  return request<GraphResponse>('/api/graph', {
    method: 'POST',
    body: JSON.stringify({
      doi: input.doi,
      predecessor_max_depth: input.settings.predecessorMaxDepth,
      successor_max_depth: input.settings.successorMaxDepth,
      predecessor_limits_by_depth: input.settings.predecessorLimitsByDepth,
      successor_limits_by_depth: input.settings.successorLimitsByDepth,
    }),
  });
}

export function searchKeywords(keywords: string[], mode: 'or' | 'and', limit: number) {
  const params = new URLSearchParams({ mode, limit: String(limit) });
  keywords.forEach((keyword) => params.append('keywords', keyword));
  return request<SearchResponse>(`/api/search?${params.toString()}`);
}
