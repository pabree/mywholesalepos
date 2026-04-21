from django.urls import path
from .payment_views import (
    MpesaStkPushView,
    MpesaCallbackView,
    PaymentStatusView,
    MpesaStatusByCheckoutView,
    BackOfficePaymentsListView,
    BackOfficePaymentsExportView,
    BackOfficePaymentDetailView,
    BackOfficeDeliveryCollectionRemitView,
)

urlpatterns = [
    path("backoffice/export/", BackOfficePaymentsExportView.as_view(), name="backoffice-payments-export"),
    path("backoffice/", BackOfficePaymentsListView.as_view(), name="backoffice-payments-list"),
    path("backoffice/<uuid:payment_id>/", BackOfficePaymentDetailView.as_view(), name="backoffice-payments-detail"),
    path("backoffice/<uuid:payment_id>/remit/", BackOfficeDeliveryCollectionRemitView.as_view(), name="backoffice-delivery-remit"),
    path("backoffice/remit/", BackOfficeDeliveryCollectionRemitView.as_view(), name="backoffice-delivery-remit-bulk"),
    path("mpesa/stk-push/", MpesaStkPushView.as_view(), name="mpesa-stk-push"),
    path("mpesa/callback/", MpesaCallbackView.as_view(), name="mpesa-callback"),
    path("mpesa/status/<uuid:payment_id>/", PaymentStatusView.as_view(), name="payment-status"),
    path("mpesa/status/checkout/<str:checkout_id>/", MpesaStatusByCheckoutView.as_view(), name="mpesa-status-checkout"),
    path("<uuid:payment_id>/", PaymentStatusView.as_view(), name="payment-detail"),
]
