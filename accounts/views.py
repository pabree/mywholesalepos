from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.db.models import Q
from accounts.models import User
from accounts.permissions import RolePermission
from business.models import Branch
from core.pagination import StandardLimitOffsetPagination


def _parse_bool(value):
    if value is None or str(value).strip() == "":
        return None
    val = str(value).strip().lower()
    if val in ("1", "true", "yes", "y", "on"):
        return True
    if val in ("0", "false", "no", "n", "off"):
        return False
    return None


class CustomAuthToken(ObtainAuthToken):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        display_name = f"{user.first_name} {user.last_name}".strip()
        role = (user.role or "").strip().lower()
        return Response(
            {
                "token": token.key,
                "user_id": str(user.id),
                "username": user.username,
                "email": user.email,
                "role": role,
                "display_name": display_name,
            }
        )


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        display_name = f"{user.first_name} {user.last_name}".strip()
        role = (user.role or "").strip().lower()
        return Response(
            {
                "user_id": str(user.id),
                "username": user.username,
                "email": user.email,
                "role": role,
                "display_name": display_name,
            }
        )


class AssignableUsersView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"cashier", "salesperson", "supervisor", "admin"}

    def get(self, request):
        qs = User.objects.filter(
            role__in=["deliver_person", "salesperson"],
            is_active=True,
        ).order_by("first_name", "last_name", "username")
        data = []
        for user in qs:
            display_name = f"{user.first_name} {user.last_name}".strip()
            data.append(
                {
                    "id": str(user.id),
                    "username": user.username,
                    "display_name": display_name or user.username,
                    "role": (user.role or "").strip().lower(),
                }
            )
        return Response(data)


class UserListView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def get(self, request):
        query = (request.query_params.get("search") or "").strip()
        qs = User.objects.select_related("branch").all()
        if query:
            qs = qs.filter(
                Q(username__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(email__icontains=query)
                | Q(phone__icontains=query)
            )

        users = qs.order_by("first_name", "last_name", "username")
        paginator = StandardLimitOffsetPagination()
        page = paginator.paginate_queryset(users, request, view=self)
        page = page if page is not None else users

        data = [
            {
                "id": str(u.id),
                "username": u.username,
                "first_name": u.first_name,
                "middle_name": u.middle_name,
                "last_name": u.last_name,
                "email": u.email,
                "phone": u.phone,
                "role": (u.role or "").strip().lower(),
                "branch_id": str(u.branch_id) if u.branch_id else None,
                "branch_name": u.branch.branch_name if u.branch else None,
                "is_active": u.is_active,
            }
            for u in page
        ]

        if page is not users:
            return paginator.get_paginated_response(data)
        return Response(data)


class UserCreateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def post(self, request):
        data = request.data or {}
        errors = {}

        username = str(data.get("username") or "").strip()
        if not username:
            errors["username"] = "Username is required."
        elif User.objects.filter(username=username).exists():
            errors["username"] = "Username already exists."

        first_name = str(data.get("first_name") or "").strip()
        if not first_name:
            errors["first_name"] = "First name is required."

        last_name = str(data.get("last_name") or "").strip()
        if not last_name:
            errors["last_name"] = "Last name is required."

        email = str(data.get("email") or "").strip()
        if not email:
            errors["email"] = "Email is required."
        elif User.objects.filter(email=email).exists():
            errors["email"] = "Email already exists."

        role = str(data.get("role") or "").strip().lower()
        valid_roles = {choice[0] for choice in User.ROLE_CHOICES}
        if not role:
            errors["role"] = "Role is required."
        elif role not in valid_roles:
            errors["role"] = "Invalid role."

        password = str(data.get("password") or "")
        if not password:
            errors["password"] = "Password is required."
        elif len(password) < 6:
            errors["password"] = "Password must be at least 6 characters."

        branch_id = data.get("branch_id") or data.get("branch")
        branch = None
        if branch_id:
            branch = Branch.objects.filter(id=branch_id).first()
            if not branch:
                errors["branch"] = "Branch not found."

        middle_name = str(data.get("middle_name") or "").strip() or None
        phone = str(data.get("phone") or "").strip() or None
        is_active = _parse_bool(data.get("is_active"))

        if errors:
            return Response(errors, status=400)

        user = User.objects.create_user(
            username=username,
            password=password,
            first_name=first_name,
            middle_name=middle_name,
            last_name=last_name,
            email=email,
            phone=phone,
            role=role,
            branch=branch,
            is_active=True if is_active is None else is_active,
        )

        return Response({"id": str(user.id)}, status=201)


class UserUpdateView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = {"supervisor", "admin"}

    def put(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        data = request.data or {}
        errors = {}

        username = str(data.get("username") or "").strip()
        if not username:
            errors["username"] = "Username is required."
        elif User.objects.filter(username=username).exclude(id=user.id).exists():
            errors["username"] = "Username already exists."

        first_name = str(data.get("first_name") or "").strip()
        if not first_name:
            errors["first_name"] = "First name is required."

        last_name = str(data.get("last_name") or "").strip()
        if not last_name:
            errors["last_name"] = "Last name is required."

        email = str(data.get("email") or "").strip()
        if not email:
            errors["email"] = "Email is required."
        elif User.objects.filter(email=email).exclude(id=user.id).exists():
            errors["email"] = "Email already exists."

        role = str(data.get("role") or "").strip().lower()
        valid_roles = {choice[0] for choice in User.ROLE_CHOICES}
        if not role:
            errors["role"] = "Role is required."
        elif role not in valid_roles:
            errors["role"] = "Invalid role."

        password = str(data.get("password") or "")
        if password and len(password) < 6:
            errors["password"] = "Password must be at least 6 characters."

        branch_id = data.get("branch_id") or data.get("branch")
        branch = None
        if branch_id:
            branch = Branch.objects.filter(id=branch_id).first()
            if not branch:
                errors["branch"] = "Branch not found."

        middle_name = str(data.get("middle_name") or "").strip() or None
        phone = str(data.get("phone") or "").strip() or None
        is_active = _parse_bool(data.get("is_active"))

        if errors:
            return Response(errors, status=400)

        user.username = username
        user.first_name = first_name
        user.middle_name = middle_name
        user.last_name = last_name
        user.email = email
        user.phone = phone
        user.role = role
        user.branch = branch
        if is_active is not None:
            user.is_active = is_active
        if password:
            user.set_password(password)
        user.save()

        return Response({"id": str(user.id)}, status=200)
