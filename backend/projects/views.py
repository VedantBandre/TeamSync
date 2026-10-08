from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from organizations.permissions import IsOrganizationAdminOrReadOnly
from .models import Project
from .serializers import ProjectSerializer


class ProjectViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsOrganizationAdminOrReadOnly]
    serializer_class = ProjectSerializer
    queryset = Project.objects.all()

    def get_queryset(self):
        queryset = Project.objects.filter(
            organization__membership__user=self.request.user
        ).select_related("organization")
        if self.action in ("update", "partial_update", "destroy", "archive", "restore"):
            queryset = queryset.select_for_update(of=("self",))
        return queryset

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def archive(self, request, pk=None):
        project = self.get_object()
        if not project.archived_at:
            project.archived_at = timezone.now()
            project.save(update_fields=["archived_at"])
        return Response(self.get_serializer(project).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def restore(self, request, pk=None):
        project = self.get_object()
        if project.archived_at:
            project.archived_at = None
            project.save(update_fields=["archived_at"])
        return Response(self.get_serializer(project).data)
