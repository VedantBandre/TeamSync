from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated

from .serializers import RegistrationSerializer, UserSerializer


class RegisterView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = RegistrationSerializer


class CurrentUserView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user
