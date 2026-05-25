import type { CompleteOnboardingResponse, CurrentAccountResponse } from "@harakiri/shared";
import { request } from "./request";

export const accountApi = {
  me: () => request<CurrentAccountResponse>("/v1/me"),
  completeOnboarding: () => request<CompleteOnboardingResponse>("/v1/me/onboarding/complete", { method: "POST" })
};
