import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { HarakiriClient } from "@h-sandbox/sdk";

const harakiri = new HarakiriClient({
  apiUrl: process.env.HARAKIRI_API_URL,
  apiKey: process.env.HARAKIRI_API_KEY
});

const templateId = `sdk-template-${Date.now()}`;
const archivePath = process.env.HARAKIRI_TEMPLATE_ARCHIVE;

if (!archivePath) {
  throw new Error("Set HARAKIRI_TEMPLATE_ARCHIVE to a tar+gzip build context path.");
}

const archive = await readFile(archivePath);
const sha256 = `sha256:${createHash("sha256").update(archive).digest("hex")}`;

await harakiri.createTemplate({
  id: templateId,
  name: "SDK Template Example",
  description: "Template created from the SDK example.",
  image: "ubuntu:24.04",
  visibility: "private",
  cpuCount: 1,
  memoryMb: 1024,
  workdir: "/workspace"
});

const { build } = await harakiri.createTemplateBuild(templateId, {
  sourceType: "dockerfile",
  dockerfilePath: "Dockerfile"
});

await harakiri.uploadTemplateBuildContext(build.id, {
  archiveBase64: archive.toString("base64"),
  sha256,
  sizeBytes: archive.byteLength
});

console.log(`Build queued: ${build.id}`);
