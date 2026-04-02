from django.utils.dateparse import parse_date
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import RolePermission
from .models import Expense
from .serializers import ExpenseSerializer
from core.pagination import StandardLimitOffsetPagination


def _parse_date(value, label):
    if not value:
        return None, None
    parsed = parse_date(value)
    if not parsed:
        return None, f"Invalid {label} date."
    return parsed, None


class ExpenseListCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_raw = request.query_params.get("date_from") or request.query_params.get("start")
        end_raw = request.query_params.get("date_to") or request.query_params.get("end")
        start_date, start_error = _parse_date(start_raw, "date_from")
        end_date, end_error = _parse_date(end_raw, "date_to")
        if start_error or end_error:
            return Response({"detail": start_error or end_error}, status=400)

        qs = Expense.objects.filter(is_active=True)
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)

        category = request.query_params.get("category")
        if category:
            qs = qs.filter(category__iexact=category.strip())

        branch_id = request.query_params.get("branch")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        qs = qs.order_by("-date", "-created_at")
        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        page = page if page is not None else qs
        data = ExpenseSerializer(page, many=True).data
        if page is not qs:
            return paginator.get_paginated_response(data)
        return Response(data)

    def post(self, request):
        serializer = ExpenseSerializer(data=request.data)
        if serializer.is_valid():
            expense = serializer.save()
            return Response(ExpenseSerializer(expense).data, status=201)
        return Response(serializer.errors, status=400)


class ExpenseDetailView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def patch(self, request, expense_id):
        try:
            expense = Expense.objects.get(id=expense_id)
        except Expense.DoesNotExist:
            return Response({"detail": "Expense not found"}, status=404)
        serializer = ExpenseSerializer(expense, data=request.data, partial=True)
        if serializer.is_valid():
            expense = serializer.save()
            return Response(ExpenseSerializer(expense).data)
        return Response(serializer.errors, status=400)


class ExpenseExportView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"admin"}

    def get(self, request):
        start_raw = request.query_params.get("date_from") or request.query_params.get("start")
        end_raw = request.query_params.get("date_to") or request.query_params.get("end")
        start_date, start_error = _parse_date(start_raw, "date_from")
        end_date, end_error = _parse_date(end_raw, "date_to")
        if start_error or end_error:
            return Response({"detail": start_error or end_error}, status=400)

        qs = Expense.objects.filter(is_active=True)
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)

        category = request.query_params.get("category")
        if category:
            qs = qs.filter(category__iexact=category.strip())

        branch_id = request.query_params.get("branch")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        qs = qs.order_by("-date", "-created_at").select_related("branch", "created_by")

        rows = ["date,amount,category,branch,description,created_by,reference"]
        for exp in qs:
            branch = exp.branch.name if exp.branch else ""
            creator = ""
            if exp.created_by:
                creator = f"{exp.created_by.first_name or ''} {exp.created_by.last_name or ''}".strip() or exp.created_by.username or exp.created_by.email or ""
            rows.append(
                f"{exp.date},{exp.amount},{exp.category},{branch},{exp.description},{creator},{exp.reference}"
            )

        from django.http import HttpResponse
        response = HttpResponse("\n".join(rows), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="expenses_export.csv"'
        return response
