from datetime import timezone

from django.db import transaction
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from projects.archiving import require_active_project
from projects.models import Project
from .filtering import filter_tasks, positive_id

from .models import Task, TaskActivity
from .serializers import TaskSerializer, TaskCommentSerializer, TaskActivitySerializer


class DiscussionPagination(PageNumberPagination):
    page_size = 20


class TaskPagination(PageNumberPagination):
    page_size = 50


class TaskViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TaskSerializer
    queryset = Task.objects.all()
    pagination_class = TaskPagination

    def paginate_queryset(self, queryset):
        # Keep existing deployed clients working during independent frontend/API
        # rollouts. New boards always send project + page and use bounded pages.
        if "project" not in self.request.query_params and "page" not in self.request.query_params:
            return None
        return super().paginate_queryset(queryset)

    def get_queryset(self):
        queryset = Task.objects.filter(
            project__organization__membership__user=self.request.user
        ).select_related("project__organization", "assigned_to")
        if self.action in ("list", "summary") and "project" in self.request.query_params:
            project_id = positive_id(self.request.query_params["project"], "project")
            get_object_or_404(Project.objects.filter(organization__membership__user=self.request.user), pk=project_id)
            queryset = queryset.filter(project_id=project_id)
        writes = self.action in ("update", "partial_update", "destroy", "comment_detail") or (self.action == "comments" and self.request.method == "POST")
        if writes:
            reference = get_object_or_404(queryset, pk=self.kwargs["pk"])
            # Lock project before task so archive/delete and task writes agree on order.
            require_active_project(reference.project_id)
            queryset = queryset.select_for_update(of=("self",))
        return queryset.order_by("id")

    def filter_queryset(self, queryset):
        # List filters must never affect detail authorization or write lookups.
        if self.action == "list":
            return filter_tasks(queryset, self.request.query_params)
        return queryset

    @action(detail=False, methods=["get"])
    def summary(self, request):
        queryset = self.get_queryset()
        def counts(rows):
            return rows.aggregate(total=Count("id"), TODO=Count("id", filter=Q(status="TODO")),
                                  IN_PROGRESS=Count("id", filter=Q(status="IN_PROGRESS")),
                                  DONE=Count("id", filter=Q(status="DONE")))
        revision = TaskActivity.objects.filter(task__in=queryset).aggregate(latest=Max("id"))["latest"] or 0
        return Response({"all": counts(queryset), "filtered": counts(filter_tasks(queryset, request.query_params)), "revision": revision})

    def record(self, task, kind, changes=None):
        TaskActivity.objects.create(
            task=task, actor=self.request.user, actor_name=self.request.user.username,
            kind=kind, changes=changes or {},
        )

    @transaction.atomic
    def perform_create(self, serializer):
        require_active_project(serializer.validated_data["project"].pk)
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

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

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
    @transaction.atomic
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
