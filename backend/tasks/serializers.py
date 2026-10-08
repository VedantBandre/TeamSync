from django.contrib.auth.models import User
from rest_framework import serializers

from organizations.models import Membership
from projects.models import Project
from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ["id", "project", "title", "description", "assigned_to", "status", "priority", "due_date", "created_at"]
        read_only_fields = ["created_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["project"].queryset = Project.objects.filter(
                organization__membership__user=request.user
            )
            self.fields["assigned_to"].queryset = User.objects.filter(
                membership__organization__membership__user=request.user,
                is_active=True,
            ).distinct()

    def validate(self, attrs):
        if self.instance and "project" in attrs and attrs["project"].pk != self.instance.project_id:
            raise serializers.ValidationError({"project": "Tasks cannot move between projects."})
        project = attrs.get("project") or self.instance.project
        assignee = attrs.get("assigned_to", self.instance.assigned_to if self.instance else None)
        if assignee and not Membership.objects.filter(
            organization=project.organization, user=assignee
        ).exists():
            raise serializers.ValidationError({"assigned_to": "Assignee must belong to this project's organization."})
        return attrs
