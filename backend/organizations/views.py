from django.db import transaction
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated

from tasks.models import Task, TaskActivity

from .models import Organization, Membership
from .permissions import IsOrganizationAdminOrReadOnly
from .serializers import OrganizationSerializer, MembershipSerializer


class OrganizationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsOrganizationAdminOrReadOnly]
    serializer_class = OrganizationSerializer
    queryset = Organization.objects.all()

    def get_queryset(self):
        return Organization.objects.filter(membership__user=self.request.user)

    @transaction.atomic
    def perform_create(self, serializer):
        organization = serializer.save(created_by=self.request.user)
        Membership.objects.create(
            user=self.request.user, organization=organization, role="ADMIN"
        )


class MembershipViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsOrganizationAdminOrReadOnly]
    serializer_class = MembershipSerializer
    queryset = Membership.objects.all()

    def get_queryset(self):
        return Membership.objects.filter(
            organization__membership__user=self.request.user
        ).select_related("organization", "user")

    def protect_last_admin(self, membership):
        # Serialize admin removals within an organization on databases with row locks.
        Organization.objects.select_for_update().get(pk=membership.organization_id)
        membership.refresh_from_db()
        if membership.role == "ADMIN" and not Membership.objects.filter(
            organization_id=membership.organization_id, role="ADMIN"
        ).exclude(pk=membership.pk).exists():
            raise ValidationError({"role": "An organization must retain at least one admin."})

    @transaction.atomic
    def perform_update(self, serializer):
        if serializer.validated_data.get("role") == "MEMBER":
            self.protect_last_admin(serializer.instance)
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        self.protect_last_admin(instance)
        assigned_tasks = Task.objects.filter(
            project__organization_id=instance.organization_id,
            assigned_to_id=instance.user_id,
        )
        # Lock and record automatic unassignments in the same removal transaction.
        tasks = list(assigned_tasks.select_for_update(of=("self",)).order_by("id"))
        TaskActivity.objects.bulk_create([
            TaskActivity(
                task=task, actor=self.request.user, actor_name=self.request.user.username,
                kind="UPDATED", changes={"assigned_to": {"from": instance.user.username, "to": None}},
            ) for task in tasks
        ])
        assigned_tasks.update(assigned_to=None)
        instance.delete()
