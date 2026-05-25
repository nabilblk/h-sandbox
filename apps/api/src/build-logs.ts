import type { DbClient } from "./db.js";
import { PostgresBuildLogStore } from "./storage/postgres-build-log-store.js";

export const appendBuildLog = async (client: DbClient, buildId: string, stream: "stdout" | "stderr", message: string) => {
  await new PostgresBuildLogStore(client).append({ buildId, stream, message });
};

export const buildLogStore = new PostgresBuildLogStore();
export { PostgresBuildLogStore };
