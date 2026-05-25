import type { UsageSummary } from "@harakiri/shared";
import { request } from "./request";

export const usageApi = {
  usage: () => request<UsageSummary>("/v1/usage")
};
