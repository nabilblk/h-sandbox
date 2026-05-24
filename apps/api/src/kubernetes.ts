import { BatchV1Api, CoreV1Api, KubeConfig } from "@kubernetes/client-node";

let kc: KubeConfig | null = null;
let core: CoreV1Api | null = null;
let batch: BatchV1Api | null = null;

export const kubernetes = {
  config() {
    if (!kc) {
      kc = new KubeConfig();
      if (process.env.KUBERNETES_SERVICE_HOST) kc.loadFromCluster();
      else kc.loadFromDefault();
    }
    return kc;
  },
  core() {
    core ??= this.config().makeApiClient(CoreV1Api);
    return core;
  },
  batch() {
    batch ??= this.config().makeApiClient(BatchV1Api);
    return batch;
  }
};
