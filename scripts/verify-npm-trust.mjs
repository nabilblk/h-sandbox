import { pathToFileURL } from "node:url";

const packages = ["@h-sandbox/sdk", "@h-sandbox/cli"];
class VerificationError extends Error {}

export async function verifyNpmTrust({ env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  if (env.GITHUB_ACTIONS !== "true" || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || !env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    throw new VerificationError("Run verification in the protected npm-release.yml workflow with id-token: write.");
  }
  let oidcUrl;
  try { oidcUrl = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL); }
  catch { throw new VerificationError("Invalid GitHub OIDC request URL."); }
  if (oidcUrl.protocol !== "https:" || !oidcUrl.hostname.endsWith(".actions.githubusercontent.com") ||
      oidcUrl.username || oidcUrl.password || oidcUrl.port) {
    throw new VerificationError("Unexpected GitHub OIDC request origin.");
  }
  oidcUrl.searchParams.set("audience", "npm:registry.npmjs.org");

  const json = async (url, init, expectedStatus, label) => {
    try {
      const response = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (response.status !== expectedStatus) {
        await response.body?.cancel();
        throw new VerificationError(`${label} failed (HTTP ${response.status}). Check the package publisher, workflow and environment settings.`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof VerificationError) throw error;
      // Identity URLs, response bodies and fetch errors can contain credentials.
      throw new VerificationError(`${label} failed: request or JSON response unavailable.`);
    }
  };

  const identity = await json(oidcUrl, { headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } }, 200, "GitHub OIDC identity");
  if (typeof identity?.value !== "string" || !identity.value.trim()) throw new VerificationError("GitHub did not return an OIDC identity.");

  const verified = [];
  for (const name of packages) {
    const result = await json(
      `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name)}`,
      { method: "POST", headers: { authorization: `Bearer ${identity.value}` } },
      201, `npm OIDC exchange for ${name}`
    );
    // Match npm CLI's exchange contract; auxiliary metadata is not required.
    if (typeof result?.token !== "string" || !result.token.trim()) {
      throw new VerificationError(`npm did not return an exchange token for ${name}.`);
    }
    // Never print, persist or use the exchanged token to mutate a package.
    verified.push(name);
    log(`Verified npm OIDC token exchange for ${name}.`);
  }
  log("Authentication verified only. No package versions or dist-tags changed; direct publishing remains to be tested.");
  return verified;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyNpmTrust().catch((error) => {
    console.error(error instanceof VerificationError ? error.message : "npm trust verification failed.");
    process.exitCode = 1;
  });
}
