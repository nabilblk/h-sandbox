# Release Checks

A deterministic project for the Harakiri UI product tour. No model, customer
data or model-provider account is required. The scripts need no npm packages.

The minimal Node template needs a connectivity tool for the built-in access
test. Before restricting outbound access, run this in Commands (or use a team
template that includes these tools already):

```sh
sh prepare-tools.sh
```

The included script installs curl and certificate roots with apt. Full package
output remains in `/tmp/tour-packages.log`; installation fails on a nonzero exit.

Upload these files to `/workspace` in a Node 20 sandbox attached to a persistent
workspace. In the Commands tab, set **Working directory** to `/workspace`.

```sh
node check.mjs
```

The three checks create `report.json`. Start the preview with `node server.mjs`
and expose port 3000 in Network. Public access is appropriate only for this
synthetic fixture. Do not publish real project data this way.

Terminate the first sandbox and attach the same workspace to a new Node 20
sandbox. Do not run `check.mjs` again. Verify the retained report:

```sh
node -e 'const r=require("./report.json");if(r.results.length!==3||!r.results.every(x=>x.passed))process.exit(1);console.log("Retained report: 3 checks passed")'
```

Terminate the replacement sandbox and archive the workspace. Archive retains
files and allocation; ask your operator about physical storage deletion.
