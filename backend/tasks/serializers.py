from django.contrib.auth.models import User
from rest_framework import serializers

from organizations.models import Membership
from projects.models import Project
from .models import Task, TaskComment, TaskActivity


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


class TaskCommentSerializer(serializers.ModelSerializer):
    body = serializers.CharField(max_length=4000, trim_whitespace=True)

    def create(self, validated_data):
        comment = super().create(validated_data)
        # Django evaluates the two automatic timestamps separately on insertion.
        # A new comment is not an edit; expose the same timestamp until it changes.
        TaskComment.objects.filter(pk=comment.pk).update(updated_at=comment.created_at)
        comment.updated_at = comment.created_at
        return comment

    class Meta:
        model = TaskComment
        fields = ["id", "task", "author", "author_name", "body", "created_at", "updated_at"]
        read_only_fields = ["id", "task", "author", "author_name", "created_at", "updated_at"]


class TaskActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskActivity
        fields = ["id", "actor", "actor_name", "kind", "changes", "created_at"]
        read_only_fields = fields
