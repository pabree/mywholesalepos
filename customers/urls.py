from django.urls import path
from .views import CustomerListView, CustomerCreateView, CustomerUpdateView

urlpatterns = [
    path("", CustomerListView.as_view(), name="list_customers"),
    path("create/", CustomerCreateView.as_view(), name="create_customer"),
    path("<uuid:customer_id>/", CustomerUpdateView.as_view(), name="update_customer"),
]
