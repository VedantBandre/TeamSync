import hashlib
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Invitation, Membership, Organization


class InvitationTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin")
        self.member = User.objects.create_user(username="member")
        self.guest = User.objects.create_user(username="guest")
        self.other = User.objects.create_user(username="other")
        self.org = Organization.objects.create(name="Design studio", created_by=self.admin)
        self.other_org = Organization.objects.create(name="Other team", created_by=self.other)
        Membership.objects.create(user=self.admin, organization=self.org, role="ADMIN")
        Membership.objects.create(user=self.member, organization=self.org)
        Membership.objects.create(user=self.other, organization=self.other_org, role="ADMIN")
        self.client.force_authenticate(self.admin)

    def create_invite(self):
        response = self.client.post("/api/invitations/", {"organization": self.org.pk}, format="json")
        self.assertEqual(response.status_code, 201)
        return response.data

    def accept(self, token):
        return self.client.post("/api/invitations/accept/", {"token": token}, format="json")

    def test_create_binds_author_and_expiry_and_only_returns_raw_token_once(self):
        response = self.client.post("/api/invitations/", {
            "organization": self.org.pk, "role": "ADMIN", "created_by": self.other.pk,
            "expires_at": "2099-01-01T00:00:00Z", "token_digest": "forged",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response["Cache-Control"], "no-store")
        invitation = Invitation.objects.get(pk=response.data["id"])
        self.assertEqual(invitation.created_by, self.admin)
        self.assertEqual(invitation.token_digest, hashlib.sha256(response.data["token"].encode()).hexdigest())
        self.assertEqual(len(response.data["token"]), 43)
        self.assertAlmostEqual((invitation.expires_at - timezone.now()).total_seconds(), 7 * 86400, delta=5)
        detail = self.client.get(f"/api/invitations/{invitation.pk}/").data
        self.assertNotIn("token", detail)
        self.assertNotIn("token_digest", detail)
        self.assertNotIn("token", self.client.get("/api/invitations/").data["results"][0])

    def test_only_admins_can_create_list_and_revoke_team_invitations(self):
        invitation = self.create_invite()
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.post("/api/invitations/", {"organization": self.org.pk}).status_code, 403)
        self.assertEqual(self.client.get("/api/invitations/").data["count"], 0)
        self.assertEqual(self.client.post(f"/api/invitations/{invitation['id']}/revoke/").status_code, 404)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post("/api/invitations/", {"organization": self.org.pk}).status_code, 400)
        self.assertEqual(self.client.get(f"/api/invitations/{invitation['id']}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/invitations/?organization={self.org.pk}").data["count"], 0)

    def test_preview_does_not_grant_membership_and_accept_only_grants_member(self):
        invitation = self.create_invite()
        self.client.force_authenticate(self.guest)
        preview = self.client.post("/api/invitations/preview/", {"token": invitation["token"]}, format="json")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["organization_name"], "Design studio")
        self.assertFalse(Membership.objects.filter(user=self.guest).exists())
        response = self.client.post("/api/invitations/accept/", {"token": invitation["token"], "role": "ADMIN", "user": self.other.pk, "organization": self.other_org.pk}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Membership.objects.get(user=self.guest).role, "MEMBER")
        self.assertEqual(Membership.objects.get(user=self.guest).organization, self.org)
        self.assertFalse(Membership.objects.filter(user=self.other, organization=self.org).exists())

    def test_one_use_and_idempotent_retries(self):
        invitation = self.create_invite()
        self.client.force_authenticate(self.guest)
        self.assertEqual(self.accept(invitation["token"]).status_code, 200)
        self.assertEqual(self.accept(invitation["token"]).status_code, 200)
        self.assertEqual(Membership.objects.filter(user=self.guest, organization=self.org).count(), 1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.accept(invitation["token"]).status_code, 410)
        self.assertFalse(Membership.objects.filter(user=self.other, organization=self.org).exists())

    def test_expired_and_revoked_links_cannot_be_previewed_or_accepted(self):
        for change in ({"expires_at": timezone.now() - timedelta(seconds=1)}, {"revoked_at": timezone.now()}):
            self.client.force_authenticate(self.admin)
            invitation = self.create_invite()
            Invitation.objects.filter(pk=invitation["id"]).update(**change)
            self.client.force_authenticate(self.guest)
            for endpoint in ("preview", "accept"):
                self.assertEqual(self.client.post(f"/api/invitations/{endpoint}/", {"token": invitation["token"]}).status_code, 410)
        self.assertFalse(Membership.objects.filter(user=self.guest).exists())

    def test_existing_member_does_not_consume_active_link_or_change_role(self):
        invitation = self.create_invite()
        response = self.accept(invitation["token"])
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["already_member"])
        self.assertIsNone(Invitation.objects.get(pk=invitation["id"]).accepted_at)
        self.assertEqual(Membership.objects.get(user=self.admin, organization=self.org).role, "ADMIN")

    def test_removed_member_cannot_reuse_previously_accepted_invitation(self):
        invitation = self.create_invite()
        self.client.force_authenticate(self.guest)
        self.accept(invitation["token"])
        Membership.objects.filter(user=self.guest, organization=self.org).delete()
        self.assertEqual(self.accept(invitation["token"]).status_code, 410)

    def test_revocation_is_idempotent_and_used_links_cannot_be_revoked(self):
        invitation = self.create_invite()
        for _ in range(2):
            response = self.client.post(f"/api/invitations/{invitation['id']}/revoke/")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["state"], "REVOKED")
        invitation = self.create_invite()
        self.client.force_authenticate(self.guest)
        self.accept(invitation["token"])
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f"/api/invitations/{invitation['id']}/revoke/").status_code, 400)

    def test_deleted_team_and_bad_tokens_are_unavailable(self):
        invitation = self.create_invite()
        self.org.delete()
        self.client.force_authenticate(self.guest)
        self.assertEqual(self.accept(invitation["token"]).status_code, 404)
        self.assertEqual(self.accept("x" * 43).status_code, 404)
        for token in ("", "invalid", "!" * 43):
            self.assertEqual(self.accept(token).status_code, 400)

    def test_accept_failure_does_not_consume_link(self):
        invitation = self.create_invite()
        self.client.force_authenticate(self.guest)
        with patch("organizations.invitations.Membership.objects.create", side_effect=RuntimeError("Unavailable")):
            with self.assertRaises(RuntimeError):
                self.accept(invitation["token"])
        self.assertIsNone(Invitation.objects.get(pk=invitation["id"]).accepted_at)
        self.assertFalse(Membership.objects.filter(user=self.guest).exists())

    def test_anonymous_access_is_denied_and_unsupported_updates_cannot_change_team(self):
        invitation = self.create_invite()
        self.assertEqual(self.client.patch(f"/api/invitations/{invitation['id']}/", {"organization": self.other_org.pk}).status_code, 405)
        self.client.force_authenticate(None)
        for endpoint in ("preview", "accept"):
            self.assertEqual(self.client.post(f"/api/invitations/{endpoint}/", {"token": invitation["token"]}).status_code, 401)
        self.assertEqual(self.client.get("/api/invitations/").status_code, 401)

    def test_invalid_filter_and_expired_state(self):
        invitation = self.create_invite()
        self.assertEqual(self.client.get("/api/invitations/?organization=bad").status_code, 400)
        Invitation.objects.filter(pk=invitation["id"]).update(expires_at=timezone.now() - timedelta(days=1))
        self.assertEqual(self.client.get(f"/api/invitations/{invitation['id']}/").data["state"], "EXPIRED")
