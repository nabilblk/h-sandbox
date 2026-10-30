import { execFileSync } from "node:child_process";
import test from "node:test";

test("browser response and event failures never escape a slower failed UI action", () => {
  execFileSync(process.execPath, ["--unhandled-rejections=strict", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { setTimeout as delay } from "node:timers/promises";
    import { transferFailures } from ${JSON.stringify(new URL("./files.mjs", import.meta.url).href)};
    import { upload, downloadSelected } from ${JSON.stringify(new URL("./browser.mjs", import.meta.url).href)};

    const rejected = () => Promise.reject(new Error("network wait failed"));
    const slowClick = async () => { await delay(30); throw new Error("UI action failed"); };
    for (const action of [transferFailures, downloadSelected, page => upload(page, {})]) {
      const files = { getByRole: (_role, { name }) => ({ click: name === "Download" ? slowClick : async () => {} }) };
      const page = {
        getByRole: role => role === "region" ? files : { click: slowClick },
        waitForResponse: rejected,
        waitForEvent: rejected
      };
      await assert.rejects(action(page), /network wait failed/);
      await delay(60);
    }
  `], { stdio: "pipe", timeout: 5000 });
});
