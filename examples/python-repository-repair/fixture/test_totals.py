import unittest

from totals import total_paid


class TotalsTest(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(total_paid([]), 0)

    def test_paid(self):
        self.assertEqual(total_paid([{"status": "paid", "cents": 120}]), 120)

    def test_pending(self):
        self.assertEqual(total_paid([{"status": "pending", "cents": 120}]), 0)

    def test_refunded(self):
        self.assertEqual(
            total_paid([{"status": "paid", "cents": 120}, {"status": "refunded", "cents": 90}]),
            120,
        )


if __name__ == "__main__":
    unittest.main()
