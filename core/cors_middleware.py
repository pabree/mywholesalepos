from django.conf import settings


class CorsMiddleware:
    """Simple CORS middleware. Restricts origins via settings.CORS_ALLOWED_ORIGINS."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.headers.get("Origin")
        allowed_origins = set(getattr(settings, "CORS_ALLOWED_ORIGINS", []))
        allow_origin = origin if origin in allowed_origins else None

        # Handle preflight OPTIONS requests
        if request.method == "OPTIONS":
            from django.http import HttpResponse
            response = HttpResponse()
            if allow_origin:
                response["Access-Control-Allow-Origin"] = allow_origin
                response["Vary"] = "Origin"
                response["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
                response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-CSRFToken"
                response["Access-Control-Max-Age"] = "86400"
                if getattr(settings, "CORS_ALLOW_CREDENTIALS", False):
                    response["Access-Control-Allow-Credentials"] = "true"
            return response

        response = self.get_response(request)
        if allow_origin:
            response["Access-Control-Allow-Origin"] = allow_origin
            response["Vary"] = "Origin"
            response["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-CSRFToken"
            if getattr(settings, "CORS_ALLOW_CREDENTIALS", False):
                response["Access-Control-Allow-Credentials"] = "true"
        return response
