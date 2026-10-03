import copy
import io
import json
import urllib.error
from pathlib import Path

import pytest
import release
import yaml


@pytest.fixture
def candidate(tmp_path):
    manifest = {"schema": 1, "source": "a" * 40, "projects": {}}
    for key, (name, _) in release.PROJECTS.items():
        files = {}
        for filename in release.filenames(name, "0.1.0rc1"):
            content = filename.encode()
            (tmp_path / filename).write_bytes(content)
            files[filename] = release.digest(content)
        manifest["projects"][key] = {"name": name, "version": "0.1.0rc1", "files": files}
    data = json.dumps(manifest).encode()
    (tmp_path / "release.json").write_bytes(data)
    return tmp_path, manifest, release.digest(data)


def test_manifest_binds_both_packages_to_exact_archives(candidate):
    directory, manifest, digest = candidate
    assert release.load(directory, digest) == manifest
    archive = next(directory.glob("*.whl"))
    archive.write_bytes(b"changed")
    with pytest.raises(ValueError, match="Archive hash mismatch"):
        release.load(directory, digest)


def test_manifest_hash_is_not_trusted_from_the_download(candidate):
    directory, _, _ = candidate
    with pytest.raises(ValueError, match="manifest hash mismatch"):
        release.load(directory, "0" * 64)


@pytest.mark.parametrize("filename", ["unqualified.whl", "other.tar.gz"])
def test_extra_archives_cannot_reach_a_publisher(candidate, filename):
    directory, _, digest = candidate
    (directory / filename).write_bytes(b"extra")
    with pytest.raises(ValueError, match="Unqualified archive"):
        release.load(directory, digest)


def test_manifest_cannot_supply_a_traversal_filename(candidate):
    directory, manifest, _ = candidate
    manifest["projects"]["sdk"]["files"] = {"../outside.whl": "a" * 64}
    data = json.dumps(manifest).encode()
    (directory / "release.json").write_bytes(data)
    with pytest.raises(ValueError, match="Unexpected archives"):
        release.load(directory, release.digest(data))


@pytest.mark.parametrize("version", ["0.1.0", "latest", "0.1.0rc1\nother=1", "../0.1.0rc1"])
def test_only_explicit_preview_versions_are_enabled(version):
    with pytest.raises(ValueError, match="rc previews"):
        release.filenames("h-sandbox", version)


def registry_response(monkeypatch, project, *, missing=(), mutate=None):
    metadata = {"info": {"name": project["name"], "version": project["version"]}, "urls": []}
    documents = {}
    for name, digest in project["files"].items():
        if name in missing:
            continue
        url = f"https://files.pythonhosted.org/{name}"
        documents[url] = name.encode()
        metadata["urls"].append(
            {"filename": name, "digests": {"sha256": digest}, "yanked": False, "url": url}
        )
    if mutate:
        mutate(metadata, documents)
    documents[f"https://pypi.org/pypi/{project['name']}/{project['version']}/json"] = json.dumps(
        metadata
    ).encode()
    monkeypatch.setattr(release, "read_url", lambda url, host: documents[url])


def test_resume_stages_only_missing_files_after_verifying_existing_bytes(candidate, monkeypatch):
    directory, manifest, _ = candidate
    sdk = manifest["projects"]["sdk"]
    wheel, sdist = release.filenames(sdk["name"], sdk["version"])
    registry_response(monkeypatch, sdk, missing=[sdist])
    target = directory / "publish"
    release.stage(directory, manifest, "pypi", "sdk", target)
    assert {path.name for path in target.iterdir()} == {sdist}
    assert not (target / wheel).exists()


def test_completed_publication_stages_nothing(candidate, monkeypatch):
    directory, manifest, _ = candidate
    registry_response(monkeypatch, manifest["projects"]["sdk"])
    target = directory / "publish"
    release.stage(directory, manifest, "pypi", "sdk", target)
    assert list(target.iterdir()) == []


@pytest.mark.parametrize(
    "failure", ["digest", "bytes", "yanked", "extra", "duplicate", "name", "version"]
)
def test_different_or_yanked_publication_is_not_silently_skipped(candidate, monkeypatch, failure):
    directory, manifest, _ = candidate
    sdk = manifest["projects"]["sdk"]

    def mutate(metadata, documents):
        first = metadata["urls"][0]
        if failure == "digest":
            first["digests"]["sha256"] = "0" * 64
        elif failure == "bytes":
            documents[first["url"]] = b"different"
        elif failure == "yanked":
            first["yanked"] = True
        elif failure == "extra":
            first["filename"] = "extra.whl"
        elif failure == "duplicate":
            metadata["urls"].append(copy.deepcopy(first))
        else:
            metadata["info"][failure] = "different"

    registry_response(monkeypatch, sdk, mutate=mutate)
    with pytest.raises(ValueError):
        release.stage(directory, manifest, "pypi", "sdk", directory / "publish")


def test_postpublish_verification_requires_complete_files(candidate, monkeypatch):
    _, manifest, _ = candidate
    sdk = manifest["projects"]["sdk"]
    registry_response(monkeypatch, sdk, missing=[next(iter(sdk["files"]))])
    with pytest.raises(ValueError, match="incomplete"):
        release.public_files("pypi", sdk, allow_missing=False)


def test_only_not_found_can_be_treated_as_unpublished(candidate, monkeypatch):
    _, manifest, _ = candidate
    sdk = manifest["projects"]["sdk"]
    for code in (404, 403, 429, 500):

        def fail(*_, code=code):
            with urllib.error.HTTPError("https://pypi.org", code, "failure", {}, None) as error:
                raise error

        monkeypatch.setattr(release, "read_url", fail)
        if code == 404:
            assert release.public_files("pypi", sdk, allow_missing=True) == {}
        else:
            with pytest.raises(urllib.error.HTTPError):
                release.public_files("pypi", sdk, allow_missing=True)


@pytest.mark.parametrize(
    "url",
    [
        "http://files.pythonhosted.org/x",
        "https://evil.test/x",
        "file:///tmp/x",
        "https://files.pythonhosted.org@evil.test/x",
    ],
)
def test_untrusted_download_url_is_rejected_before_network_access(url):
    with pytest.raises(ValueError, match="Untrusted registry URL"):
        release.read_url(url, "files.pythonhosted.org")


def test_download_size_is_bounded(monkeypatch):
    class Opener:
        def open(self, *_args, **_kwargs):
            return io.BytesIO(b"12345")

    monkeypatch.setattr(release, "MAX_RESPONSE", 4)
    monkeypatch.setattr(release.urllib.request, "build_opener", lambda *_: Opener())
    with pytest.raises(ValueError, match="exceeds"):
        release.read_url("https://files.pythonhosted.org/a", "files.pythonhosted.org")


def test_http_error_response_is_closed_before_propagation(monkeypatch):
    response = io.BytesIO(b"not found")

    class Opener:
        def open(self, *_args, **_kwargs):
            raise urllib.error.HTTPError("https://pypi.org/x", 404, "missing", {}, response)

    monkeypatch.setattr(release.urllib.request, "build_opener", lambda *_: Opener())
    with pytest.raises(urllib.error.HTTPError) as caught:
        release.read_url("https://pypi.org/x", "pypi.org")
    assert caught.value.code == 404
    assert response.closed


def test_workflow_source_must_be_reviewed_main(monkeypatch):
    monkeypatch.setenv("RELEASE_REPOSITORY", "owner/repo")
    monkeypatch.setenv("GITHUB_REPOSITORY", "owner/repo")
    monkeypatch.setenv("GITHUB_REF", "refs/heads/feature")
    with pytest.raises(ValueError, match="main"):
        release.validate_source("a" * 40)
    monkeypatch.setenv("GITHUB_REF", "refs/heads/main")
    with pytest.raises(ValueError, match="full reviewed commit"):
        release.validate_source("main")


def test_production_requires_matching_completed_testpypi_evidence(candidate, monkeypatch):
    directory, manifest, _ = candidate
    monkeypatch.setenv("TESTPYPI_RUN", "123")
    monkeypatch.setenv("GITHUB_REPOSITORY", "owner/repo")
    run = {
        "id": 123,
        "repository": {"full_name": "owner/repo"},
        "path": ".github/workflows/python-release.yml",
        "event": "workflow_dispatch",
        "head_branch": "main",
        "status": "completed",
        "conclusion": "success",
    }
    release.prior_run(run)
    run["conclusion"] = "failure"
    with pytest.raises(ValueError, match="did not pass"):
        release.prior_run(run)
    receipt = {
        "registry": "testpypi",
        "source": manifest["source"],
        "projects": manifest["projects"],
    }
    (directory / "registry-receipt.json").write_text(json.dumps(receipt))
    release.prior_registry(directory, manifest)
    receipt["registry"] = "pypi"
    (directory / "registry-receipt.json").write_text(json.dumps(receipt))
    with pytest.raises(ValueError, match="TestPyPI"):
        release.prior_registry(directory, manifest)


def test_publishing_workflow_keeps_identity_out_of_build_and_runtime_jobs():
    root = Path(__file__).resolve().parents[1]
    workflow = yaml.load(
        (root / ".github/workflows/python-release.yml").read_text(), Loader=yaml.BaseLoader
    )
    assert set(workflow["on"]) == {"workflow_dispatch"}
    assert workflow["on"]["workflow_dispatch"]["inputs"]["publish"]["default"] == "false"
    assert workflow["permissions"] == {"contents": "read"}
    jobs = workflow["jobs"]
    assert "refs/heads/main" in jobs["validate"]["if"]
    assert "vars.RELEASE_REPOSITORY" in jobs["validate"]["if"]
    publishers = {name for name, job in jobs.items() if job.get("permissions", {}).get("id-token")}
    assert publishers == {"publish-sdk", "publish-adapter"}
    for name in publishers:
        job = jobs[name]
        assert job["environment"] == "${{ inputs.registry }}"
        assert not any("install" in step.get("run", "") for step in job["steps"])
        actions = [step for step in job["steps"] if "uses" in step]
        assert all(len(step["uses"].rsplit("@", 1)[-1]) == 40 for step in actions)
        publish = next(step for step in actions if step["uses"].startswith("pypa/"))
        assert publish["with"]["attestations"] == "true"
        assert "password" not in publish["with"] and "skip-existing" not in publish["with"]
    assert "qualify" in jobs["publish-sdk"]["needs"]
    assert "publish-sdk" in jobs["verify-sdk"]["needs"]
    assert "verify-sdk" in jobs["publish-adapter"]["needs"]
    assert "publish-adapter" in jobs["verify-public"]["needs"]
    assert "verify-public" in jobs["qualify-public"]["needs"]
    assert jobs["qualify-public"]["with"]["artifact_source"] == "registry"


def test_native_workflow_verifies_supplied_bytes_before_bootstrap():
    root = Path(__file__).resolve().parents[1]
    workflow = yaml.load(
        (root / ".github/workflows/python-acceptance.yml").read_text(), Loader=yaml.BaseLoader
    )
    assert "workflow_call" in workflow["on"]
    steps = workflow["jobs"]["native"]["steps"]
    verify = next(
        i for i, step in enumerate(steps) if step.get("run") == "python3 python/release.py verify"
    )
    bootstrap = next(
        i
        for i, step in enumerate(steps)
        if step.get("run") == "node infra/acceptance/bootstrap.mjs"
    )
    assert verify < bootstrap
    run = next(step for step in steps if step.get("run") == "node infra/python-acceptance/run.mjs")
    assert "inputs.manifest" in run["env"]["PYTHON_RELEASE_MANIFEST"]
