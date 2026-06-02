#!/usr/bin/env bash
set -euo pipefail

workspace="${OPEN_HARAKIRI_WORKSPACE:-/workspace}"

required_commands=(
  bash
  curl
  git
  jq
  python
  python3
  rg
  uv
)

for command_name in "${required_commands[@]}"; do
  command -v "${command_name}" >/dev/null
done

python --version
uv --version

python - <<'PY'
import numpy
import pandas
import polars
import pyarrow
import scipy
import sklearn

frame = pandas.DataFrame({"x": [1, 2, 3]})
assert frame["x"].mean() == 2
assert polars.DataFrame({"x": [1, 2, 3]}).select(polars.col("x").mean()).item() == 2
print("python data imports ok")
PY

test -w "${workspace}"
printf 'ok\n' >"${workspace}/.harakiri-python-data-smoke"
grep -q "ok" "${workspace}/.harakiri-python-data-smoke"

echo "harakiri python-data smoke passed"
