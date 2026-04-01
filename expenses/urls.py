from django.urls import path
from .views import ExpenseListCreateView, ExpenseDetailView, ExpenseExportView


urlpatterns = [
    path("export/", ExpenseExportView.as_view(), name="expense-export"),
    path("", ExpenseListCreateView.as_view(), name="expense-list-create"),
    path("<uuid:expense_id>/", ExpenseDetailView.as_view(), name="expense-detail"),
]
