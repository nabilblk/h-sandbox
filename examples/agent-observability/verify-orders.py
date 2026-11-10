"""Independent validator. Reads only the synthetic files in the current sandbox workdir."""

import json
from pathlib import Path

orders = json.loads(Path("orders.json").read_text())
report = json.loads(Path("report.json").read_text())
expected = {
    "paid_orders": sum(order["status"] == "paid" for order in orders),
    "revenue_cents": sum(order["amount_cents"] for order in orders if order["status"] == "paid"),
    "refunded_orders": sum(order["status"] == "refunded" for order in orders),
}
if report != expected:
    raise ValueError("Report does not match the actual ledger")
print(json.dumps({"verified": True, "report": report}))
