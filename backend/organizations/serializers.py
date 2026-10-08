from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from .models import Organization, Membership
from .permissions import is_admin


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "created_at", "created_by"]
        read_only_fields = ["created_at", "created_by"]


class MembershipSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "user", "username", "organization", "role"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields["organization"].queryset = Organization.objects.filter(
                membership__user=request.user
            )

    def validate(self, attrs):
        if self.instance:
            for field in ("user", "organization"):
                if field in attrs and attrs[field].pk != getattr(self.instance, field + "_id"):
                    raise serializers.ValidationError({field: "Membership ownership cannot be changed."})
        organization = attrs.get("organization") or self.instance.organization
        if not is_admin(self.context["request"].user, organization):
            raise PermissionDenied("Only organization admins can manage memberships.")
        return attrs
