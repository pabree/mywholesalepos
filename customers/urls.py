from django.urls import path
from .views import CustomerListView, CustomerCreateView, CustomerUpdateView, CustomerApproveView, CustomerLinkView

urlpatterns = [
    path("", CustomerListView.as_view(), name="list_customers"),
    path("create/", CustomerCreateView.as_view(), name="create_customer"),
    path("<uuid:customer_id>/", CustomerUpdateView.as_view(), name="update_customer"),
    path("<uuid:customer_id>/approve/", CustomerApproveView.as_view(), name="approve_customer"),
    path("<uuid:customer_id>/link/", CustomerLinkView.as_view(), name="link_customer"),
]
