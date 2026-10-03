"""Hash-bound, token-free preparation and verification for Python releases."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tomllib
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PROJECTS = {
    "sdk": ("h-sandbox", "python-sdk"),
    "deepagents": ("h-sandbox-deepagents", "python-deepagents"),
}
REGISTRIES = {
    "pypi": ("https://pypi.org", "files.pythonhosted.org"),
    "testpypi": ("https://test.pypi.org", "test-files.pythonhosted.org"),
}
VERSION = re.compile(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)rc[1-9]\d*")
MAX_RESPONSE = 16 * 1024 * 1024


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def filenames(name: str, version: str) -> tuple[str, str]:
    require(VERSION.fullmatch(version) is not None, "Only explicit Python rc previews are enabled")
    stem = f"{name.replace('-', '_')}-{version}"
    return f"{stem}-py3-none-any.whl", f"{stem}.tar.gz"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True, timeout=30).strip()


def output(**values: str) -> None:
    if file := os.environ.get("GITHUB_OUTPUT"):
        with Path(file).open("a") as stream:
            stream.writelines(f"{key}={value}\n" for key, value in values.items())
    print(json.dumps(values, sort_keys=True))


def validate_source(source: str) -> None:
    require(bool(os.environ.get("RELEASE_REPOSITORY")), "Release repository is not configured")
    require(
        os.environ.get("GITHUB_REPOSITORY") == os.environ["RELEASE_REPOSITORY"], "Wrong repository"
    )
    require(
        os.environ.get("GITHUB_REF") == "refs/heads/main", "Release workflow must run from main"
    )
    require(re.fullmatch(r"[a-f0-9]{40}", source) is not None, "Use a full reviewed commit SHA")
    git("merge-base", "--is-ancestor", source, "refs/remotes/origin/main")
    versions = {}
    for key, (name, directory) in PROJECTS.items():
        project = tomllib.loads(git("show", f"{source}:packages/{directory}/pyproject.toml"))[
            "project"
        ]
        require(project["name"] == name, "Unexpected distribution name")
        filenames(name, project["version"])
        versions[key] = project["version"]
        if key == "deepagents":
            require(
                f"h-sandbox=={versions['sdk']}" in project["dependencies"],
                "SDK bound must be exact",
            )
    output(sha=source, **versions)


def seal(distribution: Path, source: str) -> None:
    require(git("rev-parse", "HEAD") == source, "Build checkout does not match release source")
    projects = {}
    for key, (name, directory) in PROJECTS.items():
        project = tomllib.loads(Path(f"packages/{directory}/pyproject.toml").read_text())["project"]
        files = filenames(name, project["version"])
        projects[key] = {
            "name": name,
            "version": project["version"],
            "files": {file: digest((distribution / file).read_bytes()) for file in files},
        }
    manifest = {"schema": 1, "source": source, "projects": projects}
    data = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    (distribution / "release.json").write_bytes(data)
    load(distribution, digest(data))
    output(manifest=digest(data))


def load(distribution: Path, expected_digest: str) -> dict:
    require(
        re.fullmatch(r"[a-f0-9]{64}", expected_digest) is not None,
        "Expected manifest hash required",
    )
    data = (distribution / "release.json").read_bytes()
    require(digest(data) == expected_digest, "Release manifest hash mismatch")
    manifest = json.loads(data)
    require(manifest["schema"] == 1, "Unknown release manifest schema")
    require(
        re.fullmatch(r"[a-f0-9]{40}", manifest["source"]) is not None, "Invalid source identity"
    )
    require(set(manifest["projects"]) == set(PROJECTS), "Expected SDK and adapter")
    expected_files = set()
    for key, (name, _directory) in PROJECTS.items():
        project = manifest["projects"][key]
        require(project["name"] == name, "Unexpected distribution name")
        require(
            set(project["files"]) == set(filenames(name, project["version"])), "Unexpected archives"
        )
        for file, expected in project["files"].items():
            require(not (distribution / file).is_symlink(), "Archive cannot be a symlink")
            require(digest((distribution / file).read_bytes()) == expected, "Archive hash mismatch")
            expected_files.add(file)
    actual_files = {p.name for p in distribution.iterdir() if p.name.endswith((".whl", ".tar.gz"))}
    require(actual_files == expected_files, "Unqualified archive in release directory")
    return manifest


def read_url(url: str, host: str) -> bytes:
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == "https" and parsed.netloc == host, "Untrusted registry URL")

    # Refuse redirects; no URL from registry metadata may select another origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(NoRedirect())
    try:
        response = opener.open(url, timeout=30)
    except urllib.error.HTTPError as error:
        error.close()
        raise
    with response:
        data = response.read(MAX_RESPONSE + 1)
    require(len(data) <= MAX_RESPONSE, "Registry response exceeds the release verification limit")
    return data


def public_files(registry: str, project: dict, *, allow_missing: bool) -> dict[str, bytes]:
    origin, artifact_host = REGISTRIES[registry]
    try:
        metadata = json.loads(
            read_url(
                f"{origin}/pypi/{project['name']}/{project['version']}/json",
                urllib.parse.urlsplit(origin).netloc,
            )
        )
    except urllib.error.HTTPError as error:
        if error.code == 404 and allow_missing:
            return {}
        raise
    require(metadata["info"]["name"] == project["name"], "Wrong registry project")
    require(metadata["info"]["version"] == project["version"], "Wrong registry version")
    received = {}
    for file in metadata["urls"]:
        name = file["filename"]
        require(name in project["files"] and name not in received, "Unexpected public archive")
        require(not file["yanked"], "Do not republish or qualify yanked artifacts")
        require(
            file["digests"]["sha256"] == project["files"][name], "Public metadata hash mismatch"
        )
        data = read_url(file["url"], artifact_host)
        require(digest(data) == project["files"][name], "Public archive hash mismatch")
        received[name] = data
    require(allow_missing or set(received) == set(project["files"]), "Public release is incomplete")
    return received


def stage(
    distribution: Path, manifest: dict, registry: str, project_key: str, target: Path
) -> None:
    project = manifest["projects"][project_key]
    existing = public_files(registry, project, allow_missing=True)
    target.mkdir(parents=True, exist_ok=False)
    missing = set(project["files"]) - set(existing)
    for name in sorted(missing):
        shutil.copyfile(distribution / name, target / name)
    output(has_files=str(bool(missing)).lower())


def download(manifest: dict, registry: str, project_keys: list[str], target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    receipt = {"registry": registry, "source": manifest["source"], "projects": {}}
    for key in project_keys:
        project = manifest["projects"][key]
        for name, data in public_files(registry, project, allow_missing=False).items():
            require(not (target / name).is_symlink(), "Download target cannot be a symlink")
            (target / name).write_bytes(data)
        receipt["projects"][key] = project
    (target / "registry-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")


def prior_run(run: dict) -> None:
    require(str(run["id"]) == os.environ.get("TESTPYPI_RUN"), "Wrong qualification run")
    require(
        run["repository"]["full_name"] == os.environ.get("GITHUB_REPOSITORY"), "Wrong repository"
    )
    require(run["path"] == ".github/workflows/python-release.yml", "Wrong qualification workflow")
    require(run["event"] == "workflow_dispatch" and run["head_branch"] == "main", "Untrusted run")
    require(
        run["status"] == "completed" and run["conclusion"] == "success",
        "Qualification did not pass",
    )


def prior_registry(distribution: Path, manifest: dict) -> None:
    receipt = json.loads((distribution / "registry-receipt.json").read_text())
    require(receipt["registry"] == "testpypi", "Expected TestPyPI qualification")
    require(receipt["source"] == manifest["source"], "Source differs from TestPyPI qualification")
    require(
        receipt["projects"] == manifest["projects"], "Incomplete or different TestPyPI artifacts"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "operation",
        choices=[
            "source",
            "seal",
            "verify",
            "stage",
            "download",
            "prior-run",
            "prior-registry",
        ],
    )
    parser.add_argument("--source")
    parser.add_argument("--dist", type=Path, default=Path("dist-packages/python"))
    parser.add_argument("--manifest", default=os.environ.get("PYTHON_RELEASE_MANIFEST", ""))
    parser.add_argument("--registry", choices=REGISTRIES)
    parser.add_argument("--project", choices=[*PROJECTS, "all"], default="all")
    parser.add_argument("--target", type=Path)
    parser.add_argument("--run", type=Path)
    options = parser.parse_args()
    if options.operation == "source":
        validate_source(options.source or "")
    elif options.operation == "seal":
        seal(options.dist, options.source)
    elif options.operation == "prior-run":
        prior_run(json.loads(options.run.read_text()))
    else:
        manifest = load(options.dist, options.manifest)
        if options.operation == "verify":
            return
        if options.operation == "prior-registry":
            prior_registry(options.dist, manifest)
            return
        require(
            options.registry in REGISTRIES and options.target is not None,
            "Registry and target required",
        )
        if options.operation == "stage":
            require(options.project in PROJECTS, "Stage exactly one distribution")
            stage(options.dist, manifest, options.registry, options.project, options.target)
        else:
            keys = list(PROJECTS) if options.project == "all" else [options.project]
            download(manifest, options.registry, keys, options.target)


if __name__ == "__main__":
    main()
