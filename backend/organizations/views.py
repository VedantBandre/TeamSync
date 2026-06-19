from django.shortcuts import render
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Organization, Membership
from .serializers import OrganizationSerializer, MembershipSerializer

# Create your views here.
class OrganizationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = OrganizationSerializer
    queryset = Organization.objects.all()
    def get_queryset(self):
        return Organization.objects.filter(
            membership_user=self.request.user
        )
    
    def perform_create(self, serializer):
        organization = serializer.save()
        Membership.objects.create(
            user=self.request.user,
            organization=organization,
            role="ADMIN"
        )


class MembershipViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = MembershipSerializer
    queryset = Membership.objects.all()
    
    def get_queryset(self):
        return Membership.objects.filter(
            user=self.request.user
        )
    