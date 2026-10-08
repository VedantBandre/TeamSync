from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from organizations.models import Organization
from organizations.permissions import is_admin
from .models import Project


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id", "organization", "name", "description", "created_at"]
        read_only_fields = ["created_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["organization"].queryset = Organization.objects.filter(
                membership__user=request.user
            )

    def validate(self, attrs):
        if self.instance and "organization" in attrs:
            if attrs["organization"].pk != self.instance.organization_id:
                raise serializers.ValidationError({"organization": "Projects cannot move between organizations."})
        organization = attrs.get("organization") or self.instance.organization
        if not is_admin(self.context["request"].user, organization):
            raise PermissionDenied("Only organization admins can manage projects.")
        return attrs
