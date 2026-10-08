from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Membership


def is_admin(user, organization):
    return Membership.objects.filter(
        user=user, organization=organization, role="ADMIN"
    ).exists()


class IsOrganizationAdminOrReadOnly(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        organization = obj.organization if hasattr(obj, "organization") else obj
        return is_admin(request.user, organization)
