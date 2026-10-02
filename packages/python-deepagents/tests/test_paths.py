import pytest
from harakiri_deepagents import AsyncHarakiriSandboxBackend, HarakiriSandboxBackend


@pytest.mark.parametrize("path", ["", "\0", "file\0name"])
def test_sync_delete_rejects_invalid_paths_without_resolving_cwd(sandbox, path):
    result = HarakiriSandboxBackend(sandbox, cwd="/workspace/retained").delete(path)
    assert result.error == "invalid_path"
    assert result.path is None
    sandbox.files.remove.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["", "\0", "file\0name"])
async def test_async_delete_rejects_invalid_paths_without_resolving_cwd(async_sandbox, path):
    result = await AsyncHarakiriSandboxBackend(async_sandbox, cwd="/workspace/retained").adelete(
        path
    )
    assert result.error == "invalid_path"
    assert result.path is None
    async_sandbox.files.remove.assert_not_called()


def test_sync_custom_cwd_applies_to_transfers(sandbox):
    backend = HarakiriSandboxBackend(sandbox, cwd="/workspace/repo")
    backend.upload_files([("result.txt", b"hello")])
    backend.download_files(["result.txt"])
    backend.delete("result.txt")
    assert sandbox.files.write.call_args.args[0] == "/workspace/repo/result.txt"
    assert sandbox.files.read_bytes.call_args.args[0] == "/workspace/repo/result.txt"
    assert sandbox.files.remove.call_args.args[0] == "/workspace/repo/result.txt"


@pytest.mark.asyncio
async def test_async_custom_cwd_applies_to_transfers(async_sandbox):
    backend = AsyncHarakiriSandboxBackend(async_sandbox, cwd="/workspace/repo")
    await backend.aupload_files([("result.txt", b"hello")])
    await backend.adownload_files(["result.txt"])
    await backend.adelete("result.txt")
    assert async_sandbox.files.write.call_args.args[0] == "/workspace/repo/result.txt"
    assert async_sandbox.files.read_bytes.call_args.args[0] == "/workspace/repo/result.txt"
    assert async_sandbox.files.remove.call_args.args[0] == "/workspace/repo/result.txt"
