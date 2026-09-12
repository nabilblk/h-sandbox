import type { UsageSummary, UsageHistoryOptions, UsageHistoryResponse } from "@harakiri/shared";
import { request } from "./request";

export const usageApi = {
  usage: () => request<UsageSummary>("/v1/usage"),
  usageHistory: (options: UsageHistoryOptions, signal?: AbortSignal) => request<UsageHistoryResponse>(`/v1/usage/history?${new URLSearchParams(options)}`, { signal })
};
