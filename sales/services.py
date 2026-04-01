from decimal import Decimal, ROUND_HALF_UP

MONEY_QUANT = Decimal("0.01")
DEFAULT_TAX_RATE = Decimal("0.16")


def money(value):
    return Decimal(value).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def compute_totals(subtotal, discount, amount_paid, *, tax_rate=DEFAULT_TAX_RATE):
    subtotal = money(subtotal)
    discount = money(discount)
    amount_paid = money(amount_paid)

    tax = money(subtotal * tax_rate)
    if discount > subtotal + tax:
        raise ValueError("Discount cannot exceed subtotal + tax.")

    grand_total = money(max(Decimal("0.00"), subtotal + tax - discount))
    balance = money(max(Decimal("0.00"), grand_total - amount_paid))

    return {
        "subtotal": subtotal,
        "tax": tax,
        "grand_total": grand_total,
        "balance": balance,
    }
