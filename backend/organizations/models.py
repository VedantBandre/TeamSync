from django.db import models
from django.contrib.auth.models import User

# Create your models here.
class Organization(models.Model):
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)

    def __str__(self):
        return self.name


class Membership(models.Model):
    ROLE_CHOICES = [
        ("ADMIN", "Admin" ),
        ("MEMBER", "Member"),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE
    )

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE
    )

    role = models.CharField(
        max_length=10,
        choices=ROLE_CHOICES,
        default="MEMBER"
    )

    class Meta:
        unique_together = ("user", "organization")

class Invitation(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="invitations")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="created_invitations")
    token_digest = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="accepted_invitations")

    class Meta:
        ordering = ["-created_at", "-id"]
