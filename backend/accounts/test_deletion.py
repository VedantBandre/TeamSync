from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from organizations.models import Membership, Organization
from projects.models import Project
from tasks.models import Task, TaskComment, TaskActivity
from .models import Profile, RecoveryEmail


class AccountDeletionTests(APITestCase):
    password = "Strong-deletion-password-835!"
    def setUp(self):
        self.user = User.objects.create_user(username="departing", password=self.password)
        self.other = User.objects.create_user(username="remaining", password=self.password)
        self.client.force_authenticate(self.user)
        self.url = "/api/account/deletion/"

    def delete(self, **extra):
        return self.client.post(self.url, {"current_password": self.password, "confirm_username": self.user.username, **extra})

    def team(self, role="ADMIN", member_role="ADMIN"):
        team = Organization.objects.create(name="Shared team", created_by=self.user)
        Membership.objects.create(organization=team, user=self.user, role=role)
        Membership.objects.create(organization=team, user=self.other, role=member_role)
        return team

    def test_requires_password_and_exact_username(self):
        self.assertEqual(self.delete(current_password="wrong").status_code, 400)
        self.assertEqual(self.delete(confirm_username="wrong").status_code, 400)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_blocks_only_admin_and_does_not_delete_shared_work(self):
        team = self.team(member_role="MEMBER")
        self.assertEqual(self.client.get(self.url).data["blocked_teams"], [{"id": team.pk, "name": team.name}])
        self.assertEqual(self.delete().status_code, 400)
        self.assertTrue(Organization.objects.filter(pk=team.pk).exists())

    def test_preserves_work_transfers_creator_and_removes_profile(self):
        team = self.team()
        project = Project.objects.create(organization=team, name="Keep it")
        task = Task.objects.create(project=project, title="Shared work", assigned_to=self.user)
        comment = TaskComment.objects.create(task=task, author=self.user, author_name=self.user.username, body="Keep this discussion")
        activity = TaskActivity.objects.create(task=task, actor=self.other, actor_name=self.other.username, kind="UPDATED", changes={"assigned_to": {"from": None, "to": self.user.username}})
        Profile.objects.create(user=self.user, display_name="Private name", avatar=b"avatar")
        RecoveryEmail.objects.create(user=self.user, email="delete@example.com")
        user_id = self.user.pk
        self.assertEqual(self.delete().status_code, 204)
        team.refresh_from_db(); task.refresh_from_db(); comment.refresh_from_db(); activity.refresh_from_db()
        self.assertEqual(team.created_by, self.other)
        self.assertIsNone(task.assigned_to)
        self.assertEqual(comment.author_name, "Deleted member")
        self.assertIsNone(comment.author)
        self.assertEqual(comment.body, "Keep this discussion")
        self.assertEqual(activity.changes["assigned_to"]["to"], "Deleted member")
        self.assertFalse(Profile.objects.filter(user_id=user_id).exists())
        self.assertFalse(RecoveryEmail.objects.filter(user_id=user_id).exists())

    def test_creator_who_previously_left_team_is_also_transferred(self):
        team = self.team()
        Membership.objects.filter(organization=team, user=self.user).delete()
        self.assertEqual(self.delete().status_code, 204)
        team.refresh_from_db()
        self.assertEqual(team.created_by_id, self.other.pk)

    def test_deleted_account_tokens_cannot_be_used_or_refreshed(self):
        self.client.force_authenticate(None)
        tokens = self.client.post("/api/token/", {"username": self.user.username, "password": self.password}).data
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + tokens["access"])
        self.assertEqual(self.delete().status_code, 204)
        self.assertEqual(self.client.get("/api/me/").status_code, 401)
        self.client.credentials()
        self.assertEqual(self.client.post("/api/token/refresh/", {"refresh": tokens["refresh"]}).status_code, 401)

    def test_anonymous_cannot_inspect_or_delete_an_account(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.delete().status_code, 401)


from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connection, close_old_connections, connections
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient


@override_settings(AUTH_RATE_LIMITS={})
class ConcurrentDeletionTests(TransactionTestCase):
    def test_two_admins_cannot_both_delete_and_leave_an_ownerless_team(self):
        if connection.vendor != "postgresql":
            self.skipTest("Row-lock concurrency requires PostgreSQL.")
        password = "Concurrent-deletion-password-834!"
        users = [User.objects.create_user(username=name, password=password) for name in ("admin_a", "admin_b")]
        team = Organization.objects.create(name="Retain shared work", created_by=users[0])
        for user in users:
            Membership.objects.create(organization=team, user=user, role="ADMIN")
        barrier = Barrier(2)
        def remove(user):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user)
                barrier.wait(timeout=10)
                return client.post("/api/account/deletion/", {"current_password": password, "confirm_username": user.username}).status_code
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(remove, users))
        self.assertCountEqual(statuses, [204, 400])
        team.refresh_from_db()
        admins = Membership.objects.filter(organization=team, role="ADMIN")
        self.assertEqual(admins.count(), 1)
        self.assertEqual(team.created_by_id, admins.get().user_id)
