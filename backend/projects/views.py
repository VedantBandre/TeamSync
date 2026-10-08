from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from organizations.permissions import IsOrganizationAdminOrReadOnly
from .models import Project
from .serializers import ProjectSerializer


class ProjectViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsOrganizationAdminOrReadOnly]
    serializer_class = ProjectSerializer
    queryset = Project.objects.all()

    def get_queryset(self):
        return Project.objects.filter(
            organization__membership__user=self.request.user
        ).select_related("organization")
