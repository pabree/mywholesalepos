from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status, serializers

from accounts.permissions import RolePermission
from .models import Sale, SalePayment
from .serializers import SalePaymentSerializer
from core.pagination import StandardLimitOffsetPagination
from django.http import HttpResponse
import csv


def _display_user(user):
    if not user:
        return ""
    display = getattr(user, "display_name", "") or ""
    if display:
        return display
    if hasattr(user, "get_full_name"):
        full_name = user.get_full_name()
        if full_name:
            return full_name
    return getattr(user, "username", "") or ""


def _format_dt(value):
    if not value:
        return ""
    try:
        return value.isoformat(sep=" ", timespec="seconds")
    except TypeError:
        return str(value)


def _backoffice_payments_queryset(request):
    query = (request.query_params.get("q") or "").strip()
    reference = (request.query_params.get("reference") or "").strip()
    phone = (request.query_params.get("phone") or "").strip()
    sale_param = (request.query_params.get("sale") or "").strip()
    customer_id = request.query_params.get("customer")
    branch_id = request.query_params.get("branch")
    method = request.query_params.get("method")
    status_filter = request.query_params.get("status")
    date_from = parse_date(request.query_params.get("date_from") or "")
    date_to = parse_date(request.query_params.get("date_to") or "")

    qs = SalePayment.objects.select_related(
        "sale",
        "sale__branch",
        "customer",
        "received_by",
    )

    if method:
        qs = qs.filter(method=method)
    if status_filter:
        qs = qs.filter(status=status_filter)
    if branch_id:
        qs = qs.filter(sale__branch_id=branch_id)
    if customer_id:
        qs = qs.filter(customer_id=customer_id)
    if reference:
        qs = qs.filter(reference__icontains=reference)
    if phone:
        qs = qs.filter(phone_number__icontains=phone)
    if sale_param:
        qs = qs.filter(sale_id__icontains=sale_param)
    if query:
        qs = qs.filter(
            Q(reference__icontains=query)
            | Q(phone_number__icontains=query)
            | Q(provider_checkout_id__icontains=query)
            | Q(provider_request_id__icontains=query)
            | Q(sale_id__icontains=query)
            | Q(customer__name__icontains=query)
        )
    if date_from:
        qs = qs.filter(payment_date__date__gte=date_from)
    if date_to:
        qs = qs.filter(payment_date__date__lte=date_to)

    return qs.order_by("-payment_date", "-created_at")
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


class BackOfficePaymentsListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request):
        qs = _backoffice_payments_queryset(request)

        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        page = page if page is not None else qs

        data = []
        for payment in page:
            sale = payment.sale
            branch = sale.branch if sale else None
            customer = payment.customer
            data.append(
                {
                    "id": str(payment.id),
                    "sale_id": str(payment.sale_id) if payment.sale_id else None,
                    "sale_status": sale.status if sale else None,
                    "sale_total": str(sale.grand_total) if sale else None,
                    "sale_amount_paid": str(sale.amount_paid) if sale else None,
                    "sale_balance_due": str(sale.balance_due) if sale else None,
                    "customer": {
                        "id": str(customer.id) if customer else None,
                        "name": customer.name if customer else None,
                    },
                    "branch": {
                        "id": str(branch.id) if branch else None,
                        "name": branch.branch_name if branch else None,
                        "location": branch.location if branch else None,
                    },
                    "amount": str(payment.amount),
                    "method": payment.method,
                    "status": payment.status,
                    "reference": payment.reference,
                    "phone_number": payment.phone_number,
                    "provider_checkout_id": payment.provider_checkout_id,
                    "provider_request_id": payment.provider_request_id,
                    "received_by": {
                        "id": str(payment.received_by_id),
                        "name": _display_user(payment.received_by),
                    } if payment.received_by_id else None,
                    "payment_date": payment.payment_date,
                    "created_at": payment.created_at,
                }
            )

        if page is not qs:
            return paginator.get_paginated_response(data)
        return Response(data)


class BackOfficePaymentsExportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request):
        qs = _backoffice_payments_queryset(request)
        limit = request.query_params.get("limit")
        offset = request.query_params.get("offset")
        if limit is not None or offset is not None:
            paginator = StandardLimitOffsetPagination()
            page = paginator.paginate_queryset(qs, request, view=self)
            qs = page if page is not None else qs

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="backoffice-payments.csv"'
        writer = csv.writer(response)
        writer.writerow([
            "payment_id",
            "sale_id",
            "customer",
            "branch",
            "amount",
            "method",
            "status",
            "reference",
            "phone",
            "payment_date",
            "received_by",
        ])
        for payment in qs:
            sale = payment.sale
            branch = sale.branch if sale else None
            customer = payment.customer
            reference = payment.reference or payment.provider_checkout_id or payment.provider_request_id or ""
            writer.writerow([
                str(payment.id),
                str(payment.sale_id) if payment.sale_id else "",
                customer.name if customer else "",
                branch.branch_name if branch else "",
                str(payment.amount),
                payment.method,
                payment.status,
                reference,
                payment.phone_number or "",
                _format_dt(payment.payment_date),
                _display_user(payment.received_by),
            ])
        return response


class BackOfficePaymentDetailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request, payment_id):
        payment = get_object_or_404(
            SalePayment.objects.select_related(
                "sale",
                "sale__branch",
                "customer",
                "received_by",
                "verified_by",
            ),
            id=payment_id,
        )
        sale = payment.sale
        branch = sale.branch if sale else None
        customer = payment.customer

        data = {
            "id": str(payment.id),
            "amount": str(payment.amount),
            "method": payment.method,
            "status": payment.status,
            "reference": payment.reference,
            "phone_number": payment.phone_number,
            "note": payment.note,
            "payment_date": payment.payment_date,
            "created_at": payment.created_at,
            "verified_at": payment.verified_at,
            "applied_at": payment.applied_at,
            "provider": payment.provider,
            "provider_request_id": payment.provider_request_id,
            "provider_checkout_id": payment.provider_checkout_id,
            "provider_result_code": payment.provider_result_code,
            "provider_result_desc": payment.provider_result_desc,
            "provider_metadata": payment.provider_metadata,
            "received_by": {
                "id": str(payment.received_by_id),
                "name": _display_user(payment.received_by),
            } if payment.received_by_id else None,
            "verified_by": {
                "id": str(payment.verified_by_id),
                "name": _display_user(payment.verified_by),
            } if payment.verified_by_id else None,
            "sale": {
                "id": str(sale.id) if sale else None,
                "status": sale.status if sale else None,
                "payment_status": sale.payment_status if sale else None,
                "payment_mode": sale.payment_mode if sale else None,
                "sale_type": sale.sale_type if sale else None,
                "grand_total": str(sale.grand_total) if sale else None,
                "amount_paid": str(sale.amount_paid) if sale else None,
                "balance_due": str(sale.balance_due) if sale else None,
                "sale_date": sale.sale_date if sale else None,
            },
            "customer": {
                "id": str(customer.id) if customer else None,
                "name": customer.name if customer else None,
            },
            "branch": {
                "id": str(branch.id) if branch else None,
                "name": branch.branch_name if branch else None,
                "location": branch.location if branch else None,
            },
        }
        return Response(data)


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
