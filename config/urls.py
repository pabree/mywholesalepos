"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import path, include
from django.views.generic import TemplateView
from django.conf import settings
from pathlib import Path
from accounts.views import (
    CustomAuthToken,
    CurrentUserView,
    AssignableUsersView,
    UserListView,
    UserCreateView,
    UserUpdateView,
)
from core.ai_views import AskAIView, AskAIHealthView
from sales.ledger_views import FinanceExportView


def customer_service_worker(request):
    sw_path = Path(settings.BASE_DIR) / "frontend" / "customer-sw.js"
    if not sw_path.exists():
        raise Http404("Service worker not found")
    return FileResponse(open(sw_path, "rb"), content_type="application/javascript")


def staff_service_worker(request):
    sw_path = Path(settings.BASE_DIR) / "frontend" / "staff-sw.js"
    if not sw_path.exists():
        raise Http404("Service worker not found")
    return FileResponse(open(sw_path, "rb"), content_type="application/javascript")


def staff_manifest(request):
    manifest_path = Path(settings.BASE_DIR) / "frontend" / "manifest.json"
    if not manifest_path.exists():
        raise Http404("Manifest not found")
    return FileResponse(open(manifest_path, "rb"), content_type="application/manifest+json")

urlpatterns = [
    path("", TemplateView.as_view(template_name="index.html"), name="home"),
    path("customer/", TemplateView.as_view(template_name="customer.html"), name="customer-app"),
    path("sw.js", staff_service_worker, name="staff-sw"),
    path("manifest.json", staff_manifest, name="staff-manifest"),
    path("customer/sw.js", customer_service_worker, name="customer-sw"),
    path('admin/', admin.site.urls),
    path("api/auth/token/", CustomAuthToken.as_view(), name="api-token"),
    path("api/auth/me/", CurrentUserView.as_view(), name="api-me"),
    path("api/accounts/assignable/", AssignableUsersView.as_view(), name="api-assignable-users"),
    path("api/accounts/users/", UserListView.as_view(), name="api-users"),
    path("api/accounts/users/create/", UserCreateView.as_view(), name="api-users-create"),
    path("api/accounts/users/<uuid:user_id>/", UserUpdateView.as_view(), name="api-users-update"),
    path("api/ai/ask/", AskAIView.as_view(), name="api-ai-ask"),
    path("api/ai/health/", AskAIHealthView.as_view(), name="api-ai-health"),
    path("api/ledger/", include("sales.ledger_urls")),
    path("api/finance/export/", FinanceExportView.as_view(), name="finance-export"),
    path("api/finance/performance/", include("sales.performance_urls")),
    path("api/payments/", include("sales.payment_urls")),
    path("api/expenses/", include("expenses.urls")),
    path("api/purchases/", include("purchases.urls")),
    path("api/routes/", include("logistics.urls")),
    path("api/sales/", include("sales.urls")),
    path("api/customer/", include("sales.customer_urls")),
    path("api/inventory/", include("inventory.urls")),
    path("api/customers/", include("customers.urls")),
    path("api/suppliers/", include("suppliers.urls")),
    path("api/business/", include("business.urls")),
]
