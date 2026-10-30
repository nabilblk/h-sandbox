import { execFileSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { mobileSvgPreview } from "./files.mjs";

for (const fails of [false, true]) {
  test(`mobile preview waits for remount and restores desktop after ${fails ? "failure" : "success"}`, async () => {
    const events = [];
    const files = {
      waitFor: async () => { events.push("mobile-mounted"); },
      getByText: () => ({ waitFor: async () => {} }),
      locator: selector => selector === "[data-file-row]" ? {
        getByText: () => ({ click: async () => {
          assert.equal(events.at(-1), "mobile-mounted");
          events.push("open-mobile-file");
          if (fails) throw new Error("mobile preview unavailable");
        } })
      } : { boundingBox: async () => ({ x: 0, y: 50, width: 390, height: 700 }) }
    };
    const page = {
      locator: selector => {
        assert.equal(selector, '.modal[data-swipe-panel="right"]');
        return { getByRole: () => files, waitFor: async options => {
          assert.equal(options.state, "hidden");
          events.push("drawer-unmounted");
        } };
      },
      getByRole: () => ({ waitFor: async () => { events.push("desktop-mounted"); } }),
      setViewportSize: async ({ width }) => { events.push(`viewport-${width}`); },
      screenshot: async () => { events.push("screenshot"); }
    };
    if (fails) await assert.rejects(mobileSvgPreview(page), /mobile preview unavailable/);
    else await mobileSvgPreview(page);
    assert.deepEqual(events, ["viewport-390", "mobile-mounted", "open-mobile-file",
      ...(!fails ? ["screenshot"] : []), "viewport-1440", "drawer-unmounted", "desktop-mounted"]);
  });
}

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
