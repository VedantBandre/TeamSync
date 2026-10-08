import hashlib
import secrets
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Invitation, Membership, Organization
from .permissions import is_admin


class InvitationGone(APIException):
    status_code = status.HTTP_410_GONE
    default_detail = "This invitation has expired, was revoked, or has already been used. Ask an admin for a new link."


class InvitationSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    state = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = ["id", "organization", "organization_name", "created_at", "expires_at", "revoked_at", "accepted_at", "state"]
        read_only_fields = ["id", "organization_name", "created_at", "expires_at", "revoked_at", "accepted_at", "state"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["organization"].queryset = Organization.objects.filter(membership__user=self.context["request"].user)

    def validate_organization(self, organization):
        if not is_admin(self.context["request"].user, organization):
            raise PermissionDenied("Only team admins can create invitations.")
        return organization

    def get_state(self, invitation):
        if invitation.accepted_at:
            return "ACCEPTED"
        if invitation.revoked_at:
            return "REVOKED"
        return "EXPIRED" if invitation.expires_at <= timezone.now() else "ACTIVE"


class InvitationPagination(PageNumberPagination):
    page_size = 20


class NoStoreMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response


class InvitationViewSet(NoStoreMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = InvitationSerializer
    pagination_class = InvitationPagination
    queryset = Invitation.objects.all()

    def get_queryset(self):
        queryset = Invitation.objects.filter(
            organization__membership__user=self.request.user,
            organization__membership__role="ADMIN",
        ).select_related("organization")
        organization = self.request.query_params.get("organization")
        if organization is not None:
            try:
                organization = int(organization)
            except ValueError:
                raise serializers.ValidationError({"organization": "Choose a valid team."})
            queryset = queryset.filter(organization_id=organization)
        return queryset

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization = serializer.validated_data["organization"]
        Organization.objects.select_for_update().get(pk=organization.pk)
        if not is_admin(request.user, organization):
            raise PermissionDenied("Only team admins can create invitations.")
        token = secrets.token_urlsafe(32)
        serializer.save(created_by=request.user, token_digest=hashlib.sha256(token.encode()).hexdigest(), expires_at=timezone.now() + timedelta(days=7))
        # The raw token is returned once and never stored in the database.
        return Response({**serializer.data, "token": token}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def revoke(self, request, pk=None):
        invitation = get_object_or_404(self.get_queryset().select_for_update(of=("self",)), pk=pk)
        if invitation.accepted_at:
            raise serializers.ValidationError({"detail": "This invitation was already accepted. Manage the member from your team instead."})
        if not invitation.revoked_at:
            invitation.revoked_at = timezone.now()
            invitation.save(update_fields=["revoked_at"])
        return Response(self.get_serializer(invitation).data)


class InvitationTokenSerializer(serializers.Serializer):
    token = serializers.RegexField(r"^[A-Za-z0-9_-]{43}$", max_length=43, error_messages={"invalid": "This invitation link is invalid. Ask a team admin for a new link.", "max_length": "This invitation link is invalid. Ask a team admin for a new link."})


class InvitationLookupView(NoStoreMixin, APIView):
    permission_classes = [IsAuthenticated]
    accept = False

    @transaction.atomic
    def post(self, request):
        serializer = InvitationTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        digest = hashlib.sha256(serializer.validated_data["token"].encode()).hexdigest()
        # Joins lock organization first, then invitation. This also
        # serializes joins with admin membership removals on databases with row locks.
        reference = get_object_or_404(Invitation.objects.only("organization_id"), token_digest=digest)
        organization = get_object_or_404(Organization.objects.select_for_update(), pk=reference.organization_id)
        invitation = get_object_or_404(Invitation.objects.select_for_update(), pk=reference.pk)
        member = Membership.objects.filter(organization=organization, user=request.user).exists()
        already_accepted = invitation.accepted_at and invitation.accepted_by_id == request.user.pk and member
        if not already_accepted and (invitation.accepted_at or invitation.revoked_at or invitation.expires_at <= timezone.now()):
            raise InvitationGone()
        if self.accept and not member:
            claimed = Invitation.objects.filter(
                pk=invitation.pk, accepted_at__isnull=True, revoked_at__isnull=True,
                expires_at__gt=timezone.now(),
            ).update(accepted_by=request.user, accepted_at=timezone.now())
            if not claimed:
                raise InvitationGone()
            Membership.objects.create(organization=organization, user=request.user, role="MEMBER")
        return Response({"organization": organization.pk, "organization_name": organization.name, "expires_at": invitation.expires_at, "already_member": bool(member), "role": "MEMBER"})


class InvitationAcceptView(InvitationLookupView):
    accept = True
