from .services import money


def get_unit_price(product_unit, customer, quantity, sale_type=None):
    if product_unit is None:
        raise ValueError("Product unit is required for pricing.")
    if customer is None:
        raise ValueError("Customer is required for pricing.")
    if quantity is None or quantity <= 0:
        raise ValueError("Quantity must be greater than zero.")

    if product_unit.retail_price is None:
        raise ValueError(f"Retail price missing for unit {product_unit}.")

    threshold = product_unit.wholesale_threshold
    if threshold is not None and threshold <= 0:
        raise ValueError(f"Invalid wholesale threshold for unit {product_unit}.")

    wholesale_trigger = False
    reason = "retail_default"

    if sale_type == "wholesale":
        wholesale_trigger = True
        reason = "sale_type_wholesale"
    elif getattr(customer, "is_wholesale_customer", False):
        wholesale_trigger = True
        reason = "wholesale_customer"
    elif threshold is not None and quantity >= threshold:
        wholesale_trigger = True
        reason = "quantity_threshold"

    if wholesale_trigger:
        if product_unit.wholesale_price is None:
            raise ValueError(f"Wholesale price missing for unit {product_unit}.")
        return money(product_unit.wholesale_price), "wholesale", reason

    return money(product_unit.retail_price), "retail", reason
