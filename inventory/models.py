from django.db import models
from django.core.exceptions import ValidationError
from django.db.models import Q
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
    
    sku = models.CharField(max_length=28, unique=True, db_index=True)

    cost_price = models.DecimalField(max_digits=10, decimal_places=2)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)
    retail_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    wholesale_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    wholesale_threshold = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "Products"

    def __str__(self):
        return self.name


class ProductUnit(BaseModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="units",
    )
    unit_name = models.CharField(max_length=50)
    unit_code = models.CharField(max_length=32)
    conversion_to_base_unit = models.PositiveIntegerField()
    is_base_unit = models.BooleanField(default=False)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    retail_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    wholesale_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    wholesale_threshold = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        verbose_name = "Product Unit"
        verbose_name_plural = "Product Units"
        constraints = [
            models.UniqueConstraint(
                fields=["product", "unit_code"],
                name="uniq_product_unit_code",
            ),
            models.UniqueConstraint(
                fields=["product"],
                condition=Q(is_base_unit=True),
                name="uniq_product_base_unit",
            ),
            models.CheckConstraint(
                condition=Q(conversion_to_base_unit__gt=0),
                name="product_unit_conversion_positive",
            ),
        ]

    def clean(self):
        super().clean()
        if self.is_base_unit and self.conversion_to_base_unit != 1:
            raise ValidationError({"conversion_to_base_unit": "Base unit must have conversion 1."})
        if self.conversion_to_base_unit <= 0:
            raise ValidationError({"conversion_to_base_unit": "Conversion must be positive."})
        if self.is_base_unit and self.product_id:
            existing = ProductUnit.objects.filter(product_id=self.product_id, is_base_unit=True)
            if self.pk:
                existing = existing.exclude(pk=self.pk)
            if existing.exists():
                raise ValidationError({"is_base_unit": "This product already has a base unit."})

    def __str__(self):
        return f"{self.product.name} ({self.unit_code})"


class ProductSupplier(BaseModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="supplier_links",
    )
    supplier = models.ForeignKey(
        "suppliers.Supplier",
        on_delete=models.CASCADE,
        related_name="product_links",
    )
    supplier_sku = models.CharField(max_length=64, blank=True, default="")
    supplier_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    is_primary = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Product Supplier"
        verbose_name_plural = "Product Suppliers"
        constraints = [
            models.UniqueConstraint(
                fields=["product", "supplier"],
                name="uniq_product_supplier",
            ),
            models.UniqueConstraint(
                fields=["product"],
                condition=Q(is_primary=True),
                name="uniq_product_primary_supplier",
            ),
        ]

    def __str__(self):
        return f"{self.product} → {self.supplier}"
    
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
