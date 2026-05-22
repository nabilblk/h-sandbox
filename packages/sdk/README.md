# Harakiri SDK

```ts
import { HarakiriClient } from "@harakiri/sdk";

const harakiri = new HarakiriClient({
  apiUrl: "http://127.0.0.1:18082",
  apiKey: process.env.HARAKIRI_API_KEY!
});

const { sandbox } = await harakiri.createSandbox({ template: "python-3.12-data" });
const { result } = await harakiri.runSandbox(sandbox.id, { command: "python -c 'print(2+2)'" });
await harakiri.killSandbox(sandbox.id);
```
