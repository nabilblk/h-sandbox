# Third-Party Materials

Harakiri's own source declares Apache-2.0. The root, SDK and CLI license files
contain the canonical license text, including its appendix, and retain the
existing contributor copyright. This does not relicense dependencies or grant
rights to third-party trademarks.

| Material | Location and upstream terms | Distribution boundary |
| --- | --- | --- |
| OpenSandbox chart | `infra/charts/opensandbox/LICENSE`; see its README for upstream and modifications | Retain the vendored license and upstream attribution when mirroring the chart |
| Demo fonts | `apps/demo-video/public/fonts/*-LICENSE.txt`, SIL Open Font License | Keep both font notices with redistributed media/source assets |
| npm dependencies | Each installed package's license and notices | Review the exact lockfile and the contents of the artifact being distributed |
| Optional demo production | `apps/demo-video`, [Remotion terms](https://www.remotion.dev/license) | Core API, SDK, CLI, dashboard and contributor checks do not require rendering a video. The maintainer's eligibility does not establish a contributor's rendering rights |
| Agent/runtime images | Upstream packages, OS distributions, OpenCode and OpenSandbox | Container contents need their own SBOM, notices and vulnerability review; the application lockfile is not their inventory |

The September 9 installed dependency inventory includes MIT, Apache-2.0, BSD,
ISC, OFL, MPL-2.0, LGPL-3.0-or-later, CC-BY-4.0 and Remotion-specific declarations.
The LGPL component is the installed libvips binary; MPL packages include media
tooling; `caniuse-lite` declares CC-BY-4.0. Eight Remotion packages have `Unknown`
metadata in pnpm's report; they are covered by Remotion's own terms, not silently
relicensed as Apache-2.0. The maintainer confirmed eligibility for demo
production. Contributors must independently satisfy the applicable rendering
license. Generated MP4s do not ship the Remotion renderer; rendering is optional
and is not required to run the control plane or consume its SDK/CLI.

The tracked demo material records this project's own interfaces, fixture tasks
and generated example applications. Font notices remain alongside their source
files. The September 9 review inventoried 62 binary/media files; OCR covered all
tracked raster images and five-second samples from 18 videos (302 images/frames),
with no scanner findings. This is a sampled review, not inspection of every
video frame, a trademark license, or a legal opinion. No customer recording or
third-party research document is included in the candidate. The unrelated
untracked `docs/cot/` material remains outside the release scope.

Reproduce the installed-package inventory:

```bash
pnpm install --frozen-lockfile
pnpm licenses list --json
```

Container manifests, layers and their notices are reviewed separately for each
candidate. Dependency notices remain in installed packages; exact container
inventories and residual advisories belong in the release receipt. Secret scanning
does not establish media rights or container redistribution compliance. See the
[publication checklist](docs/oss-launch-review.md) for remaining gates.
