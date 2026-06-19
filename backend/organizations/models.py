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