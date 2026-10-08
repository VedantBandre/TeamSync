from django.contrib.auth.models import User
from rest_framework.test import APITestCase


class AuthenticationTests(APITestCase):
    def test_registration_login_refresh_and_team_creation(self):
        response = self.client.post("/api/register/", {"username": "new_user", "email": "user@example.com", "password": "Strong-test-password-904!"})
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("password", response.data)
        user = User.objects.get(username="new_user")
        self.assertTrue(user.check_password("Strong-test-password-904!"))
        response = self.client.post("/api/token/", {"username": "new_user", "password": "Strong-test-password-904!"})
        self.assertEqual(response.status_code, 200)
        tokens = response.data
        self.assertEqual(self.client.post("/api/token/refresh/", {"refresh": tokens["refresh"]}).status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(self.client.get("/api/me/").data["id"], user.pk)
        self.assertEqual(self.client.post("/api/organizations/", {"name": "First team"}).status_code, 201)

    def test_weak_password_is_rejected(self):
        response = self.client.post("/api/register/", {"username": "new_user", "password": "123"})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.exists())

    def test_duplicate_username_is_rejected(self):
        User.objects.create_user(username="existing")
        response = self.client.post("/api/register/", {"username": "existing", "password": "Strong-test-password-904!"})
        self.assertEqual(response.status_code, 400)

    def test_registration_cannot_grant_staff_or_superuser(self):
        response = self.client.post("/api/register/", {"username": "new_user", "password": "Strong-test-password-904!", "is_staff": True, "is_superuser": True})
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="new_user")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_invalid_credentials_and_tokens_are_rejected(self):
        self.assertEqual(self.client.post("/api/token/", {"username": "missing", "password": "wrong"}).status_code, 401)
        self.assertEqual(self.client.post("/api/token/refresh/", {"refresh": "invalid"}).status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer invalid")
        self.assertEqual(self.client.get("/api/me/").status_code, 401)


class ProfileTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="profile-owner")
        self.other = User.objects.create_user(username="another-user")
        self.client.force_authenticate(self.user)

    def test_existing_users_have_empty_profiles_and_can_save_their_own(self):
        self.assertEqual(self.client.get("/api/me/").data["display_name"], "")
        response = self.client.patch("/api/me/", {"display_name": "Vedant", "nickname": "V", "status": "Focusing", "status_emoji": "💻", "id": self.other.pk, "username": "hacked", "email": "hacked@example.com"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/me/").data["status"], "Focusing")
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "profile-owner")
        self.assertEqual(self.user.email, "")
        self.assertFalse(hasattr(self.other, "profile"))
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/me/").data["status"], "")

    def test_photo_is_normalized_and_can_be_removed(self):
        import base64
        from io import BytesIO
        from PIL import Image
        stream = BytesIO()
        Image.new("RGB", (400, 200), "green").save(stream, format="PNG")
        avatar = "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode()
        response = self.client.patch("/api/me/", {"avatar": avatar}, format="json")
        self.assertEqual(response.status_code, 200)
        normalized = response.data["avatar"]
        self.assertTrue(normalized.startswith("data:image/jpeg;base64,"))
        self.assertEqual(Image.open(BytesIO(base64.b64decode(normalized.split(",")[1]))).size, (256, 256))
        self.assertEqual(self.client.get("/api/me/").data["avatar"], normalized)
        self.assertEqual(self.client.patch("/api/me/", {"avatar": None}, format="json").data["avatar"], None)

    def test_invalid_photos_and_long_status_do_not_change_profile(self):
        for payload in ({"avatar": "data:image/svg+xml;base64,PHN2Zz4="}, {"avatar": "data:image/png;base64,aGVsbG8="}, {"status": "x" * 121}, {"nickname": "x" * 41}):
            self.assertEqual(self.client.patch("/api/me/", payload, format="json").status_code, 400)
        self.assertEqual(self.client.get("/api/me/").data["avatar"], None)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.patch("/api/me/", {"status": "Hi"}).status_code, 401)


    def test_team_members_see_profile_without_private_account_fields(self):
        from organizations.models import Organization, Membership
        org = Organization.objects.create(name="Studio", created_by=self.user)
        Membership.objects.create(user=self.user, organization=org, role="ADMIN")
        Membership.objects.create(user=self.other, organization=org)
        self.client.patch("/api/me/", {"display_name": "Vedant", "status": "Focusing"}, format="json")
        self.client.force_authenticate(self.other)
        member = next(row for row in self.client.get("/api/memberships/").data if row["user"] == self.user.pk)
        self.assertEqual(member["profile"]["status"], "Focusing")
        self.assertNotIn("email", member["profile"])
        outsider = User.objects.create_user(username="profile-outsider")
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get("/api/memberships/").data, [])
