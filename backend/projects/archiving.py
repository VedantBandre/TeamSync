from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from .models import Project


def require_active_project(project_id):
    """Call inside a transaction to serialize writes with archive/restore."""
    project = get_object_or_404(Project.objects.select_for_update(), pk=project_id)
    if project.archived_at:
        raise ValidationError({"detail": "This project is archived. Restore it before making changes."})
    return project
