from datetime import timezone

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Task, TaskActivity
from .serializers import TaskSerializer, TaskCommentSerializer, TaskActivitySerializer


class DiscussionPagination(PageNumberPagination):
    page_size = 20


class TaskViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TaskSerializer
    queryset = Task.objects.all()

    def get_queryset(self):
        queryset = Task.objects.filter(
            project__organization__membership__user=self.request.user
        ).select_related("project__organization", "assigned_to")
        if self.action in ("update", "partial_update", "comment_detail"):
            queryset = queryset.select_for_update(of=("self",))
        return queryset

    def record(self, task, kind, changes=None):
        TaskActivity.objects.create(
            task=task, actor=self.request.user, actor_name=self.request.user.username,
            kind=kind, changes=changes or {},
        )

    @transaction.atomic
    def perform_create(self, serializer):
        task = serializer.save()
        self.record(task, "CREATED")

    @staticmethod
    def snapshot(task):
        return {
            "title": task.title, "description": task.description,
            "status": task.status, "priority": task.priority,
            "assigned_to": task.assigned_to.username if task.assigned_to else None,
            "due_date": task.due_date.astimezone(timezone.utc).isoformat() if task.due_date else None,
        }

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        before = self.snapshot(serializer.instance)
        task = serializer.save()
        after = self.snapshot(task)
        changes = {field: {"from": before[field], "to": value}
                   for field, value in after.items() if before[field] != value}
        if changes:
            self.record(task, "UPDATED", changes)

    def paginated(self, queryset, serializer):
        paginator = DiscussionPagination()
        page = paginator.paginate_queryset(queryset, self.request, view=self)
        return paginator.get_paginated_response(serializer(page, many=True).data)

    @action(detail=True, methods=["get", "post"])
    def comments(self, request, pk=None):
        task = self.get_object()
        if request.method == "GET":
            return self.paginated(task.comments.all(), TaskCommentSerializer)
        serializer = TaskCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save(task=task, author=request.user, author_name=request.user.username)
            self.record(task, "COMMENT_ADDED")
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch", "delete"], url_path=r"comments/(?P<comment_id>[0-9]+)")
    @transaction.atomic
    def comment_detail(self, request, pk=None, comment_id=None):
        task = self.get_object()
        comment = get_object_or_404(task.comments, pk=comment_id)
        if comment.author_id != request.user.pk:
            raise PermissionDenied("You can only change your own comments.")
        if request.method == "DELETE":
            comment.delete()
            self.record(task, "COMMENT_DELETED")
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = TaskCommentSerializer(comment, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        previous = comment.body
        if serializer.validated_data.get("body", previous) != previous:
            serializer.save()
        if comment.body != previous:
            self.record(task, "COMMENT_EDITED")
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def activity(self, request, pk=None):
        return self.paginated(self.get_object().activity.all(), TaskActivitySerializer)
