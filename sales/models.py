from django.db import models, transaction
from core.models import BaseModel
from inventory.models import Inventory
from inventory.models import StockMovement

# Create your models here.
class Sale(BaseModel):
    STATUS_CHOICES=[
        ("pending", "Pending"),
        ("held", "Held"),
        ("completed", "Completed"),
        ("canceled", "Canceled"),
    ]
    branch = models.ForeignKey("business.branch", on_delete=models.CASCADE)
    customer = models.ForeignKey("customers.Customer", on_delete=models.CASCADE)

    total_amount = models.PositiveIntegerField()
    discount = models.DecimalField(max_digits=10, decimal_places=2)
    tax = models.DecimalField(max_digits=10, decimal_places=2)
    grand_total = models.DecimalField(max_digits=10, decimal_places=2)

    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    balance = models.DecimalField(max_digits=10, decimal_places=2)

    status = models.CharField(max_length=20,choices=STATUS_CHOICES, default="pending")
    sale_date = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Sale #{self.id} - {self.branch}"
    
    @transaction.atomic
    def complete_sale(self):

        if self.status == "completed":
            raise ValueError("Sale is already completed")
        
        for item in self.items.all():
            inventory = Inventory.objects.select_for_update().get(
                branch=self.branch, product=item.product
            )
            if inventory.quantity < item.quantity:
                raise ValueError(
                    f"Not enough stock for item f{item.product}. Available (inventory.quantity)"
                )
            
            previous_qty = inventory.quantity
            inventory.quantity -= item.quantity
            inventory.save()

            StockMovement.objects.create(
                inventory=Inventory,
                sale=self,
                movement_type=sale,
                quantity_change=item.quantity,
                previous_quantity=previous_qty,
                new_quantity=inventory.quantity,
                notes=f"Sale #{self.id} for {self.customer}"

            )

        self.status = "completed"
        self.save()
    
class SaleItem(BaseModel):
    sale = models.ForeignKey("Sale", on_delete=models.CASCADE)
    product = models.ForeignKey("inventory.Product", on_delete = models.CASCADE)

    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"
    