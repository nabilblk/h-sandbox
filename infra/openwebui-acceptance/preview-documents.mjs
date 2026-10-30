import assert from "node:assert/strict";

export function previewHtml(png, total) {
  assert.ok(Buffer.isBuffer(png) && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  assert.ok(Number.isSafeInteger(total));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sales report</title></head>
<body style="margin:16px;font-family:system-ui;color:#171717">
<h1 style="font-size:26px">Sales report</h1><p>Total sales: ${total}</p>
<p style="font-size:14px;color:#555">Preview fixture rendered from the agent's verified results.</p>
<img alt="Sales by region" style="display:block;max-width:100%;height:auto" src="data:image/png;base64,${png.toString("base64")}">
</body></html>`;
}

// Separate renderer fixtures, never replacements for model-generated JSON/PNG.
// Use a fresh browser context with no operator session or network resources.
export async function previewDocuments(browser, png, total) {
  const html = previewHtml(png, total);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.locator("img").evaluate(image => image.decode());
    return { html: Buffer.from(html), pdf: await page.pdf({ format: "A4", printBackground: true }) };
  } finally {
    await context.close();
  }
}
