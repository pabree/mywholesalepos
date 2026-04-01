import uuid
from django.core.management.base import BaseCommand
from business.models import Business, Branch
from customers.models import Customer
from inventory.models import Category, Product, ProductUnit, Inventory


class Command(BaseCommand):
    help = "Seed the database with sample data for testing the retail POS."

    def handle(self, *args, **options):
        self.stdout.write("Seeding database...")

        # Business
        business, _ = Business.objects.get_or_create(
            business_name="Wholesale Mart",
            defaults={
                "email": "info@wholesalemart.co.ke",
                "phone": "+254700000000",
                "kra_pin": "A000000000A",
            }
        )
        self.stdout.write(f"  Business: {business}")

        # Branches
        branches_data = [
            {"branch_name": "Main Branch", "location": "Nairobi CBD"},
            {"branch_name": "Westlands", "location": "Westlands, Nairobi"},
        ]
        branches = []
        for bd in branches_data:
            branch, _ = Branch.objects.get_or_create(
                business=business,
                branch_name=bd["branch_name"],
                defaults={"location": bd["location"]}
            )
            branches.append(branch)
            self.stdout.write(f"  Branch: {branch}")

        # Customers
        customers_data = ["Walk-in Customer", "John Kamau", "Mary Wanjiku", "Ali Hassan"]
        for name in customers_data:
            customer, _ = Customer.objects.get_or_create(name=name)
            self.stdout.write(f"  Customer: {customer}")

        # Categories
        categories_data = ["Beverages", "Cooking Essentials", "Cleaning", "Snacks", "Personal Care"]
        categories = {}
        for cat_name in categories_data:
            cat, _ = Category.objects.get_or_create(name=cat_name)
            categories[cat_name] = cat

        # Products
        products_data = [
            {"name": "Coca Cola 500ml", "sku": "BEV-001", "category": "Beverages", "cost": 35, "sell": 50},
            {"name": "Fanta Orange 500ml", "sku": "BEV-002", "category": "Beverages", "cost": 35, "sell": 50},
            {"name": "Tusker Malt 500ml", "sku": "BEV-003", "category": "Beverages", "cost": 150, "sell": 200},
            {"name": "Minute Maid 1L", "sku": "BEV-004", "category": "Beverages", "cost": 100, "sell": 140},
            {"name": "Fresh Milk 500ml", "sku": "BEV-005", "category": "Beverages", "cost": 45, "sell": 60},
            {"name": "Kimbo 1kg", "sku": "COOK-001", "category": "Cooking Essentials", "cost": 250, "sell": 320},
            {"name": "Golden Fry 500ml", "sku": "COOK-002", "category": "Cooking Essentials", "cost": 150, "sell": 200},
            {"name": "Soko Maize Flour 2kg", "sku": "COOK-003", "category": "Cooking Essentials", "cost": 120, "sell": 160},
            {"name": "Exe Rice 2kg", "sku": "COOK-004", "category": "Cooking Essentials", "cost": 200, "sell": 270},
            {"name": "Royco Cubes 12pk", "sku": "COOK-005", "category": "Cooking Essentials", "cost": 80, "sell": 110},
            {"name": "Omo Detergent 1kg", "sku": "CLN-001", "category": "Cleaning", "cost": 200, "sell": 260},
            {"name": "Harpic Toilet Cleaner", "sku": "CLN-002", "category": "Cleaning", "cost": 180, "sell": 230},
            {"name": "Sunlight Bar Soap", "sku": "CLN-003", "category": "Cleaning", "cost": 80, "sell": 110},
            {"name": "Cadbury Dairy Milk 100g", "sku": "SNK-001", "category": "Snacks", "cost": 120, "sell": 160},
            {"name": "Tropical Heat Crisps", "sku": "SNK-002", "category": "Snacks", "cost": 30, "sell": 50},
            {"name": "Digestive Biscuits 400g", "sku": "SNK-003", "category": "Snacks", "cost": 100, "sell": 140},
            {"name": "Colgate Toothpaste 100ml", "sku": "PC-001", "category": "Personal Care", "cost": 150, "sell": 200},
            {"name": "Dettol Soap 175g", "sku": "PC-002", "category": "Personal Care", "cost": 90, "sell": 130},
            {"name": "Sure Deodorant 150ml", "sku": "PC-003", "category": "Personal Care", "cost": 300, "sell": 400},
        ]

        for pd in products_data:
            retail_price = pd["sell"]
            wholesale_price = max(pd["sell"] - 10, pd["cost"])
            product, _ = Product.objects.get_or_create(
                sku=pd["sku"],
                defaults={
                    "name": pd["name"],
                    "category": categories[pd["category"]],
                    "cost_price": pd["cost"],
                    "selling_price": pd["sell"],
                    "retail_price": retail_price,
                    "wholesale_price": wholesale_price,
                    "wholesale_threshold": 10,
                }
            )
            ProductUnit.objects.get_or_create(
                product=product,
                unit_code="base",
                defaults={
                    "unit_name": "Base Unit",
                    "conversion_to_base_unit": 1,
                    "is_base_unit": True,
                    "retail_price": product.retail_price or product.selling_price,
                    "wholesale_price": product.wholesale_price,
                    "wholesale_threshold": product.wholesale_threshold,
                },
            )
            # Create inventory at the main branch
            for branch in branches:
                Inventory.objects.get_or_create(
                    branch=branch,
                    product=product,
                    defaults={
                        "quantity": 50,
                        "reorder_level": 10,
                    }
                )
            self.stdout.write(f"  Product: {product}")

        self.stdout.write(self.style.SUCCESS("\n✅ Seed data created successfully!"))
        self.stdout.write(f"  {len(products_data)} products across {len(categories_data)} categories")
        self.stdout.write(f"  {len(branches_data)} branches, {len(customers_data)} customers")
