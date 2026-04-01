from django import forms
from django.core.exceptions import ValidationError
from django.forms.models import BaseInlineFormSet

from .models import ProductUnit


class ProductUnitForm(forms.ModelForm):
    class Meta:
        model = ProductUnit
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if "conversion_to_base_unit" in self.fields:
            self.fields["conversion_to_base_unit"].help_text = (
                "For the base unit this must be 1. "
                "For other units, enter how many base units it equals."
            )
        if "is_base_unit" in self.fields:
            self.fields["is_base_unit"].help_text = "Each product must have exactly one base unit."

    def clean(self):
        cleaned = super().clean()
        product = cleaned.get("product") or getattr(self.instance, "product", None)
        is_base = cleaned.get("is_base_unit")
        conversion = cleaned.get("conversion_to_base_unit")

        if conversion is not None and conversion <= 0:
            raise ValidationError({"conversion_to_base_unit": "Conversion must be positive."})

        if not product:
            return cleaned

        if is_base:
            if conversion != 1:
                raise ValidationError({"conversion_to_base_unit": "Base unit conversion must be 1."})
            existing = ProductUnit.objects.filter(product=product, is_base_unit=True)
            if self.instance.pk:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise ValidationError({"is_base_unit": "This product already has a base unit."})

        return cleaned


class ProductUnitInlineFormSet(BaseInlineFormSet):
    def clean(self):
        super().clean()
        base_units = []
        for form in self.forms:
            if not hasattr(form, "cleaned_data"):
                continue
            if form.cleaned_data.get("DELETE"):
                continue
            if form.cleaned_data.get("is_base_unit"):
                base_units.append(form)

        if len(base_units) > 1:
            raise ValidationError("Only one base unit is allowed per product.")
