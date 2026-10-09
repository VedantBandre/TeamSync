from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.response import Response

from organizations.models import Organization, Membership
from projects.models import Project
from tasks.models import Task, TaskActivity, TaskComment
from .security import SecurityView


def teams_for(user):
    ids = Organization.objects.filter(Q(membership__user=user) | Q(created_by=user)).values("pk")
    return Organization.objects.filter(pk__in=ids).order_by("pk")


def remaining_admin(team, user):
    return Membership.objects.filter(organization=team, role="ADMIN", user__is_active=True).exclude(user=user).order_by("id").first()


def blockers(teams, user):
    return [{"id": team.pk, "name": team.name} for team in teams
            if (team.created_by_id == user.pk or Membership.objects.filter(organization=team, user=user, role="ADMIN").exists())
            and remaining_admin(team, user) is None]


class DeletionInput(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False, max_length=256)
    confirm_username = serializers.CharField(max_length=150)


class AccountDeletionView(SecurityView):
    def get(self, request):
        blocked = blockers(teams_for(request.user), request.user)
        return Response({"blocked_teams": blocked, "can_delete": not blocked}, headers={"Cache-Control": "no-store"})

    @transaction.atomic
    def post(self, request):
        form = DeletionInput(data=request.data)
        form.is_valid(raise_exception=True)
        # Match membership-management's organization-first lock order. Lock every
        # team before choosing successors, including teams whose creator left.
        teams = list(teams_for(request.user).select_for_update())
        project_ids = Project.objects.filter(Q(organization__in=teams) | Q(tasks__assigned_to=request.user)).values("pk")
        # Task writes lock projects first. Keep that order before locking the
        # account, so an in-flight assignment cannot deadlock against deletion.
        list(Project.objects.filter(pk__in=project_ids).order_by("pk").select_for_update())
        user = User.objects.select_for_update().filter(pk=request.user.pk).first()
        if user is None:
            raise AuthenticationFailed("This account has been deleted. Please sign in again.")
        if not user.check_password(form.validated_data["current_password"]):
            raise ValidationError({"current_password": "Your current password is incorrect."})
        if form.validated_data["confirm_username"] != user.username:
            raise ValidationError({"confirm_username": "Type your exact username to confirm."})
        blocked = blockers(teams, user)
        if blocked:
            raise ValidationError({"detail": "Promote another admin or delete these teams before deleting your account.",
                                   "blocked_teams": blocked})
        for team in teams:
            if team.created_by_id == user.pk:
                team.created_by_id = remaining_admin(team, user).user_id
                team.save(update_fields=["created_by"])
        # Shared work stays; remove the deleted identity from its attribution.
        TaskComment.objects.filter(author=user).update(author_name="Deleted member")
        TaskActivity.objects.filter(actor=user).update(actor_name="Deleted member")
        for event in TaskActivity.objects.filter(Q(changes__assigned_to__from=user.username) | Q(changes__assigned_to__to=user.username)):
            change = event.changes["assigned_to"]
            if isinstance(change, dict) and user.username in change.values():
                event.changes["assigned_to"] = {key: "Deleted member" if value == user.username else value for key, value in change.items()}
                event.save(update_fields=["changes"])
        tasks = list(Task.objects.filter(assigned_to=user).select_for_update().order_by("id"))
        TaskActivity.objects.bulk_create([TaskActivity(task=task, actor_name="Deleted member", kind="UPDATED",
            changes={"assigned_to": {"from": "Deleted member", "to": None}}) for task in tasks])
        user.delete()
        return Response(status=204)
