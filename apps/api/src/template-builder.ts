import { config } from "./config.js";
import { makeId } from "./crypto.js";
import { closeDb, withClient, type DbClient } from "./db.js";
import { resolveImageDigest } from "./registry.js";

type BuildRow = {
  id: string;
  organization_id: string;
  template_id: string;
  source_type: string;
  image_destination: string | null;
  metadata: Record<string, unknown>;
  template_image: string;
  template_default_entrypoint: string[];
  template_cpu_count: number;
  template_memory_mb: number;
  template_workdir: string;
  template_default_ports: number[];
};

const nextLogLine = async (client: DbClient, buildId: string) => {
  const result = await client.query<{ next: number }>("SELECT COALESCE(MAX(line_no), 0) + 1 AS next FROM template_build_logs WHERE build_id = $1", [buildId]);
  return Number(result.rows[0]?.next ?? 1);
};

const logBuild = async (client: DbClient, buildId: string, stream: "stdout" | "stderr", message: string) => {
  const lineNo = await nextLogLine(client, buildId);
  await client.query(
    `INSERT INTO template_build_logs (build_id, line_no, stream, message)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (build_id, line_no) DO UPDATE
       SET stream = EXCLUDED.stream, message = EXCLUDED.message`,
    [buildId, lineNo, stream, message]
  );
};

const claimImageImportBuild = async () =>
  withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query<BuildRow>(
        `SELECT b.id, b.organization_id, b.template_id, b.source_type,
                b.image_destination, b.metadata,
                t.image AS template_image,
                t.default_entrypoint AS template_default_entrypoint,
                t.cpu_count AS template_cpu_count,
                t.memory_mb AS template_memory_mb,
                t.workdir AS template_workdir,
                t.default_ports AS template_default_ports
         FROM template_builds b
         JOIN templates t ON t.id = b.template_id
         WHERE b.status = 'queued' AND b.source_type = 'image'
         ORDER BY b.created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`
      );
      const build = result.rows[0] ?? null;
      if (!build) {
        await client.query("COMMIT");
        return null;
      }
      await client.query(
        `UPDATE template_builds
         SET status = 'building',
             started_at = COALESCE(started_at, now()),
             updated_at = now()
         WHERE id = $1`,
        [build.id]
      );
      await logBuild(client, build.id, "stdout", `image import builder claimed ${build.id}`);
      await client.query("COMMIT");
      return build;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

const completeImageImportBuild = async (build: BuildRow, resolved: Awaited<ReturnType<typeof resolveImageDigest>>) =>
  withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const version = await client.query<{ next: number }>("SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM template_versions WHERE template_id = $1", [build.template_id]);
      const versionId = makeId("tplv", 12);
      const versionNumber = Number(version.rows[0]?.next ?? 1);
      await client.query(
        `INSERT INTO template_versions
         (id, template_id, organization_id, build_id, version_number, aliases,
          image_uri, image_digest, status, default_entrypoint, cpu_count, memory_mb,
          workdir, default_ports, metadata, promoted_at)
         VALUES ($1, $2, $3, $4, $5, ARRAY['latest'], $6, $7, 'ready', $8, $9, $10, $11, $12, $13, now())`,
        [
          versionId,
          build.template_id,
          build.organization_id,
          build.id,
          versionNumber,
          resolved.digestPinnedRef,
          resolved.digest,
          build.template_default_entrypoint,
          build.template_cpu_count,
          build.template_memory_mb,
          build.template_workdir,
          build.template_default_ports,
          { ...build.metadata, source: "image-import", requestedImage: build.image_destination ?? build.template_image }
        ]
      );
      await client.query(
        `UPDATE templates
         SET latest_version_id = $2,
             image = $3,
             image_digest = $4,
             status = 'ready',
             updated_at = now()
         WHERE id = $1`,
        [build.template_id, versionId, resolved.digestPinnedRef, resolved.digest]
      );
      await client.query(
        `UPDATE template_builds
         SET status = 'success',
             image_destination = $2,
             image_digest = $3,
             completed_at = now(),
             updated_at = now(),
             metadata = metadata || $4::jsonb
         WHERE id = $1`,
        [build.id, resolved.digestPinnedRef, resolved.digest, JSON.stringify({ templateVersionId: versionId })]
      );
      await logBuild(client, build.id, "stdout", `resolved ${resolved.original} to ${resolved.digest}`);
      await logBuild(client, build.id, "stdout", `created template version ${versionId}`);
      await client.query("COMMIT");
      return { versionId, digest: resolved.digest };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

const failBuild = async (build: BuildRow, error: unknown) =>
  withClient(async (client) => {
    const message = error instanceof Error ? error.message : String(error);
    await client.query("BEGIN");
    try {
      await client.query(
        `UPDATE template_builds
         SET status = 'failed',
             error = $2,
             completed_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [build.id, message]
      );
      await logBuild(client, build.id, "stderr", message);
      await client.query("COMMIT");
    } catch (rollbackError) {
      await client.query("ROLLBACK");
      throw rollbackError;
    }
  });

export const processNextImageImportBuild = async () => {
  const build = await claimImageImportBuild();
  if (!build) return null;
  const imageRef = build.image_destination ?? build.template_image;
  try {
    const resolved = await resolveImageDigest(imageRef);
    const result = await completeImageImportBuild(build, resolved);
    console.log(`template build ${build.id} imported ${resolved.digestPinnedRef} as ${result.versionId}`);
    return result;
  } catch (error) {
    await failBuild(build, error);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`template build ${build.id} failed: ${message}`);
    return null;
  }
};

export const runTemplateBuilder = async () => {
  let shuttingDown = false;
  const stop = () => {
    shuttingDown = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  do {
    await processNextImageImportBuild();
    if (config.templateBuilderOnce) break;
    if (!shuttingDown) await new Promise((resolve) => setTimeout(resolve, config.templateBuilderPollMs));
  } while (!shuttingDown);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runTemplateBuilder()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDb();
    });
}
