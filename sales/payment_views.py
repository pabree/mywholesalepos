from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status, serializers

from accounts.permissions import RolePermission
from .models import Sale, SalePayment
from .serializers import SalePaymentSerializer
from .services import money
from . import mpesa


class MpesaStkPushSerializer(serializers.Serializer):
    sale_id = serializers.UUIDField()
    phone_number = serializers.CharField(max_length=20)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)


class MpesaStkPushView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def post(self, request):
        serializer = MpesaStkPushSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        sale = get_object_or_404(Sale, id=serializer.validated_data["sale_id"])
        amount = money(serializer.validated_data["amount"])
        if amount <= 0:
            return Response({"amount": "Amount must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)
        if amount != amount.to_integral_value():
            return Response({"amount": "M-Pesa amount must be a whole number."}, status=status.HTTP_400_BAD_REQUEST)

        if sale.status == "cancelled":
            return Response({"sale": "Cancelled sales cannot be paid."}, status=status.HTTP_400_BAD_REQUEST)

        if sale.items.count() == 0:
            return Response({"sale": "Cannot pay a sale with no items."}, status=status.HTTP_400_BAD_REQUEST)

        if sale.is_credit_sale:
            if sale.sale_type != "wholesale":
                return Response({"sale_type": "Credit sales must be wholesale."}, status=status.HTTP_400_BAD_REQUEST)
            if not sale.customer_id:
                return Response({"customer": "Credit sales require a customer."}, status=status.HTTP_400_BAD_REQUEST)
            if not sale.assigned_to_id:
                return Response({"assigned_to": "Credit sales require an assigned delivery/salesperson."}, status=status.HTTP_400_BAD_REQUEST)

        if sale.status == "completed" and not sale.is_credit_sale:
            return Response({"sale": "Sale is already completed."}, status=status.HTTP_400_BAD_REQUEST)

        balance_due = sale.balance_due
        if balance_due is None or balance_due == Decimal("0.00"):
            balance_due = money(max(Decimal("0.00"), sale.grand_total - sale.amount_paid))

        if balance_due <= 0:
            return Response({"amount": "Sale has no outstanding balance."}, status=status.HTTP_400_BAD_REQUEST)

        if sale.is_credit_sale:
            if amount > balance_due:
                return Response({"amount": "Amount cannot exceed balance due."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            if amount != balance_due:
                return Response({"amount": "Non-credit sales require full payment."}, status=status.HTTP_400_BAD_REQUEST)

        pending = sale.payments.filter(method="mpesa", status="pending").first()
        if pending:
            return Response(
                {
                    "detail": "A pending M-Pesa request already exists for this sale.",
                    "payment_id": pending.id,
                    "status": pending.status,
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            normalized_phone = mpesa.normalize_phone_number(serializer.validated_data["phone_number"])
        except ValueError as exc:
            return Response({"phone_number": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            request_payload, response_payload = mpesa.stk_push(
                amount=amount,
                phone_number=normalized_phone,
                account_reference=str(sale.id),
                transaction_desc=f"Sale {sale.id}",
            )
        except Exception as exc:
            return Response({"detail": f"M-Pesa initiation failed: {exc}"}, status=status.HTTP_502_BAD_GATEWAY)

        if response_payload.get("ResponseCode") != "0":
            return Response(
                {
                    "detail": response_payload.get("ResponseDescription") or "M-Pesa request rejected.",
                    "provider": response_payload,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment = SalePayment.objects.create(
            sale=sale,
            customer=sale.customer,
            amount=amount,
            method="mpesa",
            status="pending",
            phone_number=normalized_phone,
            received_by=request.user,
            provider="mpesa",
            provider_request_id=response_payload.get("MerchantRequestID", ""),
            provider_checkout_id=response_payload.get("CheckoutRequestID", ""),
            provider_metadata={
                "request": {
                    "amount": str(amount),
                    "phone_number": normalized_phone,
                    "sale_id": str(sale.id),
                    "account_reference": str(sale.id),
                    "transaction_desc": f"Sale {sale.id}",
                },
                "response": response_payload,
            },
        )

        return Response(
            {
                "message": response_payload.get("CustomerMessage") or "M-Pesa STK push sent.",
                "payment_id": payment.id,
                "status": payment.status,
                "checkout_request_id": payment.provider_checkout_id,
                "merchant_request_id": payment.provider_request_id,
            },
            status=status.HTTP_201_CREATED,
        )


def _apply_mpesa_payment_to_sale(payment: SalePayment):
    sale = payment.sale
    if payment.applied_at:
        return

    amount = money(payment.amount)
    if amount <= 0:
        return

    if sale.status in ("draft", "held"):
        sale.amount_paid = money(sale.amount_paid + amount)
        if not sale.is_credit_sale:
            if sale.amount_paid + Decimal("0.01") < sale.grand_total:
                raise ValueError("Non-credit sales require full payment.")
            sale.payment_mode = "mpesa"
        else:
            sale.payment_mode = "credit"
        sale.balance_due = money(max(Decimal("0.00"), sale.grand_total - sale.amount_paid))
        sale.refresh_payment_status()
        sale.save(update_fields=["amount_paid", "balance_due", "payment_status", "payment_mode", "updated_at"])
        sale.complete_sale()
    elif sale.status == "completed" and sale.is_credit_sale:
        sale.apply_existing_payment(payment)
    payment.applied_at = timezone.now()
    payment.save(update_fields=["applied_at", "updated_at"])


class MpesaCallbackView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        payload = request.data or {}
        callback = payload.get("Body", {}).get("stkCallback", {})
        checkout_id = callback.get("CheckoutRequestID")
        merchant_id = callback.get("MerchantRequestID")
        result_code = str(callback.get("ResultCode", ""))
        result_desc = callback.get("ResultDesc", "")

        if not checkout_id and not merchant_id:
            return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

        with transaction.atomic():
            payment = (
                SalePayment.objects.select_for_update()
                .filter(Q(provider_checkout_id=checkout_id) | Q(provider_request_id=merchant_id), method="mpesa")
                .order_by("-created_at")
                .first()
            )
            if not payment:
                return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

            if payment.status == "completed" and not payment.applied_at:
                try:
                    _apply_mpesa_payment_to_sale(payment)
                except Exception as exc:
                    payment.provider_metadata = {
                        **(payment.provider_metadata or {}),
                        "apply_error": str(exc),
                    }
                    payment.save(update_fields=["provider_metadata", "updated_at"])
                return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

            if payment.status in ("completed", "failed"):
                return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

            metadata = mpesa.parse_callback_metadata(callback)
            payment.provider_result_code = result_code
            payment.provider_result_desc = result_desc
            payment.raw_callback = payload
            payment.provider_metadata = {
                **(payment.provider_metadata or {}),
                "callback": metadata,
            }
            payment.verified_at = timezone.now()

            if result_code == "0":
                payment.status = "completed"
                receipt = metadata.get("MpesaReceiptNumber")
                if receipt:
                    payment.reference = receipt
                phone = metadata.get("PhoneNumber")
                if phone:
                    payment.phone_number = str(phone)
                payment.save(update_fields=[
                    "status",
                    "reference",
                    "phone_number",
                    "provider_result_code",
                    "provider_result_desc",
                    "raw_callback",
                    "provider_metadata",
                    "verified_at",
                    "updated_at",
                ])
                try:
                    _apply_mpesa_payment_to_sale(payment)
                except Exception as exc:
                    payment.provider_metadata = {
                        **(payment.provider_metadata or {}),
                        "apply_error": str(exc),
                    }
                    payment.save(update_fields=["provider_metadata", "updated_at"])
            else:
                payment.status = "failed"
                payment.save(update_fields=[
                    "status",
                    "provider_result_code",
                    "provider_result_desc",
                    "raw_callback",
                    "provider_metadata",
                    "verified_at",
                    "updated_at",
                ])

        return Response({"ResultCode": 0, "ResultDesc": "Accepted"})


class PaymentStatusView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request, payment_id):
        payment = get_object_or_404(SalePayment, id=payment_id)
        sale = payment.sale
        return Response(
            {
                "id": str(payment.id),
                "sale_id": str(sale.id),
                "sale_status": sale.status,
                "sale_payment_status": sale.payment_status,
                "balance_due": sale.balance_due,
                "amount_paid": sale.amount_paid,
                "method": payment.method,
                "status": payment.status,
                "amount": payment.amount,
                "reference": payment.reference,
                "phone_number": payment.phone_number,
                "provider_checkout_id": payment.provider_checkout_id,
                "provider_request_id": payment.provider_request_id,
                "provider_result_code": payment.provider_result_code,
                "provider_result_desc": payment.provider_result_desc,
                "payment_date": payment.payment_date,
                "verified_at": payment.verified_at,
                "received_by": payment.received_by_id,
                "received_by_name": SalePaymentSerializer(payment).data.get("received_by_name"),
            }
        )


class MpesaStatusByCheckoutView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request, checkout_id):
        payment = get_object_or_404(SalePayment, provider_checkout_id=checkout_id, method="mpesa")
        sale = payment.sale
        return Response(
            {
                "id": str(payment.id),
                "sale_id": str(sale.id),
                "sale_status": sale.status,
                "sale_payment_status": sale.payment_status,
                "balance_due": sale.balance_due,
                "amount_paid": sale.amount_paid,
                "method": payment.method,
                "status": payment.status,
                "amount": payment.amount,
                "reference": payment.reference,
                "phone_number": payment.phone_number,
                "provider_checkout_id": payment.provider_checkout_id,
                "provider_request_id": payment.provider_request_id,
                "provider_result_code": payment.provider_result_code,
                "provider_result_desc": payment.provider_result_desc,
                "payment_date": payment.payment_date,
                "verified_at": payment.verified_at,
            }
        )
