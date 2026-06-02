# Python 3.12 Data Template

Python runtime for data analysis, feature extraction, and model-evaluation
tasks inside a Harakiri sandbox.

Runtime surface:

- Python 3.12, `pip`, and `uv`.
- `numpy`, `pandas`, `polars`, `pyarrow`, `scipy`, `scikit-learn`, and
  `matplotlib`.
- `git`, `jq`, `rg`, and compiler tools for common Python package installs.
- Writable `/workspace`.
- Default ports `8000` and `8888`.

## Build

```bash
harakiri template build --name python-3.12-data examples/templates/python-3.12-data
```

## Smoke Test

```bash
harakiri template smoke python-3.12-data
```

The smoke command imports the data packages and writes a file in `/workspace`.

## Use

```bash
harakiri create --template python-3.12-data --name data-runner
harakiri run sbx_... --cmd "python - <<'PY'\nimport pandas as pd\nprint(pd.DataFrame({'x':[1,2,3]}).x.mean())\nPY"
```
