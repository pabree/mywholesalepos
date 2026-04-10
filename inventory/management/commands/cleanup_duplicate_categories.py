import re
from django.core.management.base import BaseCommand
from django.db import transaction

from inventory.models import Category, Product


def normalize_category_name(value):
    if value is None:
        return ""
    name = str(value).strip()
    if not name:
        return ""
    name = re.sub(r"\s+", " ", name)
    return name.title()


def build_unique_name(base, existing_names):
    if base not in existing_names:
        return base
    suffix = 1
    while True:
        candidate = f"{base} ({suffix})"
        if candidate not in existing_names:
            return candidate
        suffix += 1


class Command(BaseCommand):
    help = "Cleanup duplicate categories by normalized name (dry-run by default)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply changes (reassign products and rename duplicates).",
        )

    def handle(self, *args, **options):
        apply = options.get("apply", False)
        categories = list(Category.objects.all().order_by("created_at", "id"))
        if not categories:
            self.stdout.write("No categories found.")
            return

        groups = {}
        for cat in categories:
            key = normalize_category_name(cat.name)
            if not key:
                key = "(empty)"
            groups.setdefault(key, []).append(cat)

        dup_groups = {k: v for k, v in groups.items() if len(v) > 1}
        if not dup_groups:
            self.stdout.write("No duplicate categories found.")
            return

        total_products_reassigned = 0
        total_categories_renamed = 0
        groups_merged = 0

        for normalized, items in dup_groups.items():
            canonical_candidates = [c for c in items if c.name == normalized]
            if canonical_candidates:
                canonical = canonical_candidates[0]
            else:
                canonical = items[0]

            duplicates = [c for c in items if c.id != canonical.id]
            dup_ids = [str(c.id) for c in duplicates]

            product_counts = {
                str(c.id): Product.objects.filter(category=c).count()
                for c in items
            }

            self.stdout.write("")
            self.stdout.write(f"Duplicate group: '{normalized}'")
            self.stdout.write(f"  Canonical: {canonical.name} ({canonical.id})")
            for dup in duplicates:
                self.stdout.write(
                    f"  Duplicate: {dup.name} ({dup.id}) • products: {product_counts.get(str(dup.id), 0)}"
                )

            if not apply:
                continue

            with transaction.atomic():
                Product.objects.filter(category__in=duplicates).update(category=canonical)
                total_products_reassigned += sum(product_counts.get(str(dup.id), 0) for dup in duplicates)

                existing_names = set(Category.objects.values_list("name", flat=True))
                for dup in duplicates:
                    base_name = f"{dup.name} (merged {str(dup.id)[:8]})"
                    new_name = build_unique_name(base_name, existing_names)
                    existing_names.add(new_name)
                    dup.name = new_name[:128]
                    dup.save(update_fields=["name", "updated_at"])
                    total_categories_renamed += 1

            groups_merged += 1

        self.stdout.write("")
        if apply:
            self.stdout.write("Summary (applied):")
            self.stdout.write(f"  groups_merged: {groups_merged}")
            self.stdout.write(f"  products_reassigned: {total_products_reassigned}")
            self.stdout.write(f"  categories_renamed: {total_categories_renamed}")
        else:
            self.stdout.write("Dry-run complete. Use --apply to perform changes.")
