from django.db import transaction
from django.contrib.auth.models import User
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated

from .serializers import RegistrationSerializer, UserSerializer


class RegisterView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = RegistrationSerializer


class CurrentUserView(generics.RetrieveUpdateAPIView):
    http_method_names = ["get", "patch", "head", "options"]
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        if self.request.method == "PATCH":
            return User.objects.select_for_update().get(pk=self.request.user.pk)
        return User.objects.select_related("profile").get(pk=self.request.user.pk)

    @transaction.atomic
    def patch(self, request, *args, **kwargs):
        return super().patch(request, *args, **kwargs)
