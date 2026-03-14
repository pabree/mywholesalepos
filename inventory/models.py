from django.db import models
from core.models import BaseModel
    
class Category(BaseModel):
    name = models.CharField(max_length=128, unique=True)

    class Meta:
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name
    
class Product(BaseModel):
    name = models.CharField(max_length=128)

    category = models.ForeignKey(Category,
                                 on_delete=models.CASCADE,
                                 related_name="products")
    
    sku = models.CharField(max_length=28, unique=True)

    cost_price = models.DecimalField(max_digits=10, decimal_places=2)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        verbose_name_plural = "Products"

    def __str__(self):
        return self.name
    
class Inventory(BaseModel):
    branch = models.ForeignKey(
        "business.Branch",
        on_delete=models.CASCADE
    )

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE
    )
    
    quantity = models.PositiveIntegerField(default=0)
    reorder_level = models.PositiveIntegerField(default=10)

    class Meta:
        verbose_name_plural = "Inventory"
        unique_together = ("branch", "product")

    def __str__(self):
        return f"{self.product}, {self.branch}"
    
class StockMovement(BaseModel):

    MOVEMENT_TYPES = [
        ("purchase", "Purchase"),
        ("sale", "Sale"),
        ("adjustment", "Adjustment"),
        ("return", "Return"),
    ]

    inventory = models.ForeignKey(
        Inventory,
        on_delete=models.CASCADE,
        related_name="movements",
        null=True,
        blank=True
    )

    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.CASCADE
    )

    branch = models.ForeignKey(
        "business.Branch",
        on_delete=models.CASCADE
    )

    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    movement_type = models.CharField(
        max_length=20,
        choices=MOVEMENT_TYPES
    )

    quantity_change = models.IntegerField()

    previous_quantity = models.PositiveIntegerField()
    new_quantity = models.PositiveIntegerField()

    reference = models.CharField(max_length=100, blank=True)

    notes = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name_plural = "Stock Movements"

    def __str__(self):
        return f"{self.product} - {self.movement_type}"
