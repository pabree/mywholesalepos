from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from accounts.models import User
from accounts.permissions import RolePermission


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
