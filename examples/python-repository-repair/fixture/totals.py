def total_paid(orders):
    return sum(order["cents"] for order in orders)
