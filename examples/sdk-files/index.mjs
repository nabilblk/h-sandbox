import { HarakiriClient } from "@harakiri/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL,
  apiKey: process.env.HARAKIRI_API_KEY
});

let sandbox;
try {
  sandbox = (await harakiri.createSandbox({ template: "python-3.12", name: "sdk-files", wait: true })).sandbox;

  await harakiri.files.write(sandbox.id, {
    path: "/workspace/input.txt",
    content: "harakiri file API\n",
    createParents: true
  });

  const read = await harakiri.files.read(sandbox.id, "/workspace/input.txt");
  console.log(read.content.trim());

  const uploaded = Buffer.from("binary artifact\n").toString("base64");
  await harakiri.files.upload(sandbox.id, {
    path: "/workspace/artifacts/out.bin",
    contentBase64: uploaded,
    sizeBytes: Buffer.byteLength("binary artifact\n"),
    createParents: true
  });

  const downloaded = await harakiri.files.download(sandbox.id, "/workspace/artifacts/out.bin");
  console.log(Buffer.from(downloaded.contentBase64, "base64").toString("utf8").trim());

  const listing = await harakiri.files.list(sandbox.id, "/workspace");
  console.log(listing.files.map((file) => file.path).join("\n"));

  await harakiri.files.remove(sandbox.id, "/workspace/artifacts", { recursive: true });
} finally {
  if (sandbox) await harakiri.killSandbox(sandbox.id).catch(() => undefined);
}
