from django.shortcuts import render
from rest_framework import viewsets
from .models import Organization, Membership
from .serializers import OrganizationSerializer, MembershipSerializer

# Create your views here.
class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer

class MembershipViewSet(viewsets.ModelViewSet):
    queryset = Membership.objects.all()
    serializer_class = MembershipSerializer