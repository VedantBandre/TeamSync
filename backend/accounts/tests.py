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
