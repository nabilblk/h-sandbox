"""Render-only Helm contracts. Never reads kubeconfig or applies resources."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
CHART = ROOT / "infra/charts/harakiri"


def render(*values: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "helm",
            "template",
            "telemetry-test",
            str(CHART),
            "-n",
            "telemetry-test",
            *[item for value in values for item in ("--set", value)],
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=20,
    )


ENABLED = (
    "observability.enabled=true",
    "observability.acknowledgePreview=true",
    "observability.collectorTokenSecret.name=telemetry-private-token",
)


def test_default_chart_has_no_telemetry_workloads_or_credentials():
    result = render()
    assert result.returncode == 0, result.stderr
    assert "observe-collector" not in result.stdout
    assert "OBSERVABILITY_COLLECTOR_TOKEN" not in result.stdout


def test_private_profile_is_persistent_digest_pinned_and_has_no_new_rbac():
    result = render(*ENABLED)
    assert result.returncode == 0, result.stderr
    docs = list(yaml.safe_load_all(result.stdout))
    telemetry = [doc for doc in docs if "observe" in doc["metadata"]["name"]]
    assert {doc["kind"] for doc in telemetry} == {
        "StatefulSet",
        "Service",
        "ServiceAccount",
        "ConfigMap",
        "NetworkPolicy",
    }
    workloads = [doc for doc in telemetry if doc["kind"] == "StatefulSet"]
    assert len(workloads) == 3
    for workload in workloads:
        spec = workload["spec"]
        assert spec["replicas"] == 1
        assert spec["persistentVolumeClaimRetentionPolicy"]["whenDeleted"] == "Retain"
        pod = spec["template"]["spec"]
        assert pod["automountServiceAccountToken"] is False
        assert pod["securityContext"]["runAsNonRoot"] is True
        container = pod["containers"][0]
        assert "@sha256:" in container["image"]
        assert container["securityContext"] == {
            "allowPrivilegeEscalation": False,
            "readOnlyRootFilesystem": True,
            "capabilities": {"drop": ["ALL"]},
        }
        assert "limits" in container["resources"] and "startupProbe" in container
        assert all("hostPath" not in volume for volume in pod["volumes"])
    for service in (doc for doc in telemetry if doc["kind"] == "Service"):
        assert service["spec"]["type"] == "ClusterIP"
        assert len(service["spec"]["ports"]) == 1
    policies = [doc for doc in telemetry if doc["kind"] == "NetworkPolicy"]
    assert len(policies) == 3
    for policy in policies:
        assert policy["spec"]["policyTypes"] == ["Ingress", "Egress"]
        assert all("podSelector" in source for source in policy["spec"]["ingress"][0]["from"])
    collector_config = next(doc for doc in telemetry if doc["kind"] == "ConfigMap")
    config = json.loads(collector_config["data"]["config.json"])
    assert config["exporters"]["otlp_http/logs"]["endpoint"] == (
        "http://telemetry-test-harakiri-observe-logs:9428/insert/opentelemetry"
    )
    api = next(
        doc
        for doc in docs
        if doc["kind"] == "Deployment" and doc["metadata"]["name"].endswith("-api")
    )
    env = {
        entry["name"]: entry for entry in api["spec"]["template"]["spec"]["containers"][0]["env"]
    }
    assert env["OBSERVABILITY_ALLOW_CONTENT"]["value"] == "0"
    assert (
        env["OBSERVABILITY_COLLECTOR_TOKEN"]["valueFrom"]["secretKeyRef"]["name"]
        == "telemetry-private-token"
    )


@pytest.mark.parametrize(
    "override",
    [
        "observability.acknowledgePreview=false",
        "observability.collectorTokenSecret.name=",
        "observability.retentionDays=0",
        "observability.retentionDays=31",
        "observability.images.logs=unversioned:latest",
        "openshift.restricted=true",
    ],
)
def test_unqualified_or_unsafe_settings_fail_render(override):
    assert render(*ENABLED, override).returncode != 0


EXTERNAL = (
    *ENABLED,
    "observability.externalExport.enabled=true",
    "observability.externalExport.endpoint=https://otel.example.test",
    "observability.externalExport.authorizationSecret.name=external-otel-token",
    "observability.externalExport.egress[0].to[0].ipBlock.cidr=192.0.2.10/32",
    "observability.externalExport.egress[0].ports[0].port=443",
)


def test_external_export_is_opt_in_after_privacy_and_uses_a_secret():
    result = render(*EXTERNAL)
    assert result.returncode == 0, result.stderr
    docs = list(yaml.safe_load_all(result.stdout))
    configmap = next(
        doc for doc in docs if doc["kind"] == "ConfigMap" and "observe" in doc["metadata"]["name"]
    )
    config = json.loads(configmap["data"]["config.json"])
    external = config["exporters"]["otlp_http/external"]
    assert "auth" not in external
    assert external["headers"] == {"Authorization": "${env:HARAKIRI_EXTERNAL_OTLP_AUTHORIZATION}"}
    assert external["sending_queue"]["block_on_overflow"] is False
    for signal, pipeline in config["service"]["pipelines"].items():
        assert pipeline["exporters"] == [f"otlp_http/{signal}", "otlp_http/external"]
        assert pipeline["processors"].index("transform/privacy") < pipeline["processors"].index(
            "batch/tenant"
        )
    collector = next(
        doc
        for doc in docs
        if doc["kind"] == "StatefulSet" and doc["metadata"]["name"].endswith("observe-collector")
    )
    env = collector["spec"]["template"]["spec"]["containers"][0]["env"]
    assert env[-1]["valueFrom"]["secretKeyRef"]["name"] == "external-otel-token"


@pytest.mark.parametrize(
    "override",
    [
        "observability.externalExport.endpoint=http://otel.example.test",
        "observability.externalExport.endpoint=https://user:password@otel.example.test",
        "observability.externalExport.endpoint=https://otel.example.test/?token=private",
        "observability.externalExport.authorizationSecret.name=",
        "observability.externalExport.egress=null",
    ],
)
def test_external_export_cannot_bypass_explicit_transport_and_credential_configuration(override):
    assert render(*EXTERNAL, override).returncode != 0
