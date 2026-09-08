import type { DocPage } from "./docs-content";
import { CodeBlock } from "./components/docs-code";

export const authorizationDocs: DocPage = {
  id: "authorization", section: "Concepts", title: "Authorization and API keys", navTitle: "Authorization",
  lede: "Separate people from automation, grant only the operations a caller needs, and understand what revocation does and does not stop.",
  toc: ["Availability", "People and automation", "Permissions", "Create a key", "Rotate and revoke", "Legacy keys", "Operator upgrade", "Troubleshooting"],
  body: <>
    <h2>Availability</h2>
    <aside className="docs-notice"><p>Available in 0.5.0-rc.4. Requires migration 037 with the matching API and dashboard. Upgrading the SDK alone does not change the server's authorization policy. Configure the Keycloak audience before upgrading an existing installation.</p></aside>
    <h2>People and automation</h2>
    <p>Keycloak signs people in. Harakiri membership determines their organization and whether they are an admin or a member. Members can run sandboxes, use shared credential sources and manage their own API keys. Only human admins can change organization settings or manage members.</p>
    <p>An API key has its own identity, scopes and expiry. It never impersonates its creator or another administrator. Its effective permissions cannot exceed its creator's current membership. Removing the creator disables the key; demoting an admin removes its sensitive permissions.</p>
    <p>Sandboxes and retained workspaces are shared organization resources, not private to the key that created them. Runtime write access allows arbitrary commands in that organization's sandboxes. Keep control-plane keys on the trusted caller, never inside agent prompts, frontend bundles or sandbox files.</p>
    <h2>Permissions</h2>
    <dl className="docs-ownership">
      <div><dt><code>sandboxes:read</code></dt><dd>Inspect sandboxes, read files/logs and follow command output.</dd></div>
      <div><dt><code>sandboxes:write</code></dt><dd>Create, execute, attach a terminal, change files/routes/egress and manage lifecycle.</dd></div>
      <div><dt><code>templates:read</code> / <code>templates:write</code></dt><dd>Read templates/builds or create, build, promote and archive them.</dd></div>
      <div><dt><code>workspaces:read</code> / <code>workspaces:write</code></dt><dd>Read retained workspaces or allocate, attach and archive them.</dd></div>
      <div><dt><code>credentials:use</code></dt><dd>Use reusable sources explicitly shared with organization members.</dd></div>
      <div><dt><code>credentials:manage</code></dt><dd>Admin-granted source custody and use of admin-only sources.</dd></div>
      <div><dt><code>registry:manage</code></dt><dd>Admin-granted registry credential management.</dd></div>
      <div><dt><code>audit:read</code></dt><dd>Admin-granted organization audit access.</dd></div>
      <div><dt><code>org:read</code></dt><dd>Read organization settings and usage.</dd></div>
    </dl>
    <p>Most SDK/CLI workflows need read and write together because they poll after mutation. Creating a workspace-backed sandbox additionally needs <code>workspaces:write</code>; attaching a credential or a template credential mapping also needs <code>credentials:use</code>. Credential-management includes credential-use, but other write scopes do not imply read scopes.</p>
    <p>No key scope grants member administration, settings writes, access to <code>/me</code>, or the ability to list, create or revoke API keys. These operations require a human OIDC access token. Source sharing, tenant ownership, runtime capability checks and template policy still apply.</p>
    <h2>Create a key</h2>
    <ol><li>Sign in and open <strong>API keys</strong>. Select <strong>Create key</strong>.</li><li>Name the caller, such as <code>ci-artifact-reader</code>. Select only its required permissions and expiry.</li><li>Store the one-time value in the caller's secret store. The list never reveals it again.</li></ol>
    <p>The default runtime profile includes sandbox, template and workspace read/write, shared credential use and organization reads. It excludes Vault administration, registry management and audit reads. New keys expire in 90 days by default, with an API maximum of 365 days.</p>
    <p>For human-authenticated provisioning, send this body to <code>POST /v1/api-keys</code>. The omitted expiry uses 90 days:</p>
    <CodeBlock language="json" filename="read-only-key.json">{JSON.stringify({ name: "ci-artifact-reader", scopes: ["sandboxes:read"] }, null, 2)}</CodeBlock>
    <p>Members can list and revoke only their own keys; admins can manage all organization keys. Existing SDK/CLI runtime calls continue to authenticate with <code>x-api-key</code>. The SDK's <code>listApiKeys()</code> is a human-authenticated administrative operation.</p>
    <h2>Rotate and revoke</h2>
    <p>Create a replacement, update the caller's secret store, verify a real operation, then revoke the old key. A lost key cannot be recovered. Use separate keys for interactive development, CI and monitoring.</p>
    <p>HTTP requests check authorization independently. Command-output streams recheck before polling. Terminal tickets are single-use and bound to the sandbox and actual principal; consuming a ticket checks permissions again. Open terminals check every five seconds, close on revoked/expired access or a failed check, and require fresh authentication to reconnect.</p>
    <p>Revoking a key does not kill detached work, stop a sandbox, retract downloaded files or revoke independent preview-route tokens. Credential scopes regulate new source access, not commands using credentials already attached to a shared runtime. Trusted reconciliation maintains existing bindings; disable or delete a source to revoke those bindings.</p>
    <p>Keycloak access tokens are verified offline. A provider logout is not an immediate server-side revocation before the token expires. Keep access-token lifetimes short; do not equate a closed browser session with instantaneous revocation everywhere.</p>
    <h2>Legacy keys</h2>
    <p>Pre-migration keys are marked <strong>Legacy</strong>. They retain a runtime-only compatibility profile and their previous expiry, often none. They no longer inherit administrator privileges, and only human admins can manage these unowned keys.</p>
    <p>Rotate them to owned, scoped, expiring keys. Vault, registry and audit automation needs explicit sensitive scopes. Existing terminal tickets without the new identity binding must be replaced. Complete the API rollout so old instances do not continue issuing legacy keys.</p>
    <h2>Operator upgrade</h2>
    <ol><li>Back up PostgreSQL and export the realm/client configuration. Inventory legacy integrations and preserve a human admin session.</li><li>Before deploying the API, add an <strong>Audience</strong> mapper to each authorized Keycloak client's dedicated scope: included custom audience <code>harakiri-api</code>, access-token claim enabled, ID-token claim disabled. Do not change public login or logout redirect URLs.</li><li>Obtain a fresh access token and inspect its claims locally. Its <code>aud</code> must include <code>harakiri-api</code>; <code>iss</code>, <code>sub</code> and <code>exp</code> must also be valid. Never upload a token to a public decoder.</li><li>Apply migration 037 through the normal migration runner and deploy the matching API, scheduler and dashboard. Existing realm imports do not update an already-created realm.</li><li>Verify admin and member workflows, create scoped replacement keys, test a real SDK/CLI operation, then retire legacy keys.</li></ol>
    <CodeBlock language="yaml" filename="authorization-values.yaml">{`config:
  AUTH_DEV_ALLOW: "0"
  KEYCLOAK_AUDIENCE: "harakiri-api"
  KEYCLOAK_SIGNING_ALGORITHMS: "RS256"`}</CodeBlock>
    <p>The dev realm and OpenShift generator include the mapper for fresh installations. Validate every additional OIDC client separately. An ID token or <code>azp=harakiri-web</code> is not a substitute for the API audience. Rolling back to the older API also restores its weaker authorization behavior.</p>
    <h2>Troubleshooting</h2>
    <p><strong>401:</strong> verify expiry, revocation, issuer, audience, JWKS reachability and the key creator's current membership. Refresh or sign in again after changing a mapper. <strong>403:</strong> check scopes, role, ownership and source sharing. Do not disable audience verification, enable development auth or redirect public login to localhost as a workaround.</p>
    <p>Continue with <a href="#docs/security-model">runtime and template security</a>, <a href="#docs/credential-vault">Credential Vault</a>, <a href="#docs/session-management">session management</a> or the <a href="#docs/api-reference">API reference</a>.</p>
  </>
};
