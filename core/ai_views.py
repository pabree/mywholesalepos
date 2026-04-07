import logging

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import RolePermission
from services.ai_assistant import ask_ai
from services.paperclip_adapter import get_paperclip_status


logger = logging.getLogger(__name__)


class AskAIView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ["admin", "supervisor"]

    def post(self, request):
        prompt = request.data.get("prompt", "")
        status = get_paperclip_status()
        logger.info("AI request started (mode=%s, user=%s)", status["mode"], request.user)
        if not status["paperclip_enabled"] or not status["configured"]:
            return Response(
                {"detail": "AI not configured: missing PAPERCLIP_* environment variables"},
                status=503,
            )
        try:
            answer = ask_ai(prompt, user=request.user)
        except ValueError as exc:
            logger.warning("AI request rejected: %s", exc)
            return Response({"detail": str(exc)}, status=400)
        except RuntimeError as exc:
            detail = str(exc)
            if "not configured" in detail.lower() or "paperclip" in detail.lower():
                detail = "AI not configured: missing PAPERCLIP_* environment variables"
            logger.error("AI request failed: %s", exc)
            return Response({"detail": detail}, status=503)
        except Exception:
            logger.exception("AI request crashed unexpectedly")
            return Response({"detail": "AI service unavailable."}, status=503)
        return Response({"answer": answer, "source": "paperclip"})


class AskAIHealthView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ["admin", "supervisor"]

    def get(self, request):
        return Response(get_paperclip_status())
