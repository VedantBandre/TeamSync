from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from organizations.models import Membership, Organization
from tasks.models import Task, TaskActivity, TaskComment
from .models import Project


class ProjectArchivingTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin")
        self.member = User.objects.create_user(username="member")
        self.outsider = User.objects.create_user(username="outsider")
        self.org = Organization.objects.create(name="Studio", created_by=self.admin)
        Membership.objects.create(user=self.admin, organization=self.org, role="ADMIN")
        Membership.objects.create(user=self.member, organization=self.org)
        self.project = Project.objects.create(name="Launch", organization=self.org)
        self.task = Task.objects.create(project=self.project, title="Ship")
        self.client.force_authenticate(self.admin)
        self.base = f"/api/projects/{self.project.pk}/"
        self.task_url = f"/api/tasks/{self.task.pk}/"
        self.comment = self.client.post(self.task_url + "comments/", {"body": "Keep this"}).data

    def archive(self):
        response = self.client.post(self.base + "archive/")
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_only_admins_can_archive_and_restore(self):
        for user, expected in ((self.member, 403), (self.outsider, 404)):
            self.client.force_authenticate(user)
            for action in ("archive", "restore"):
                self.assertEqual(self.client.post(self.base + action + "/").status_code, expected)
        self.project.refresh_from_db()
        self.assertIsNone(self.project.archived_at)

    def test_archive_is_idempotent_and_preserves_readable_work(self):
        archived = self.archive()
        self.assertIsNotNone(archived["archived_at"])
        self.assertEqual(self.archive()["archived_at"], archived["archived_at"])
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(self.base).data["archived_at"], archived["archived_at"])
        self.assertEqual(self.client.get("/api/projects/").data[0]["id"], self.project.pk)
        self.assertEqual(self.client.get(self.task_url).status_code, 200)
        self.assertEqual(self.client.get(self.task_url + "comments/").data["results"][0]["body"], "Keep this")
        self.assertEqual(self.client.get(self.task_url + "activity/").data["count"], 1)

    def test_archive_blocks_all_content_writes_without_changing_history(self):
        self.archive()
        comment_url = self.task_url + f"comments/{self.comment['id']}/"
        attempts = [
            ("patch", self.base, {"name": "Changed"}),
            ("put", self.base, {"name": "Changed", "organization": self.org.pk}),
            ("post", "/api/tasks/", {"project": self.project.pk, "title": "New"}),
            ("patch", self.task_url, {"status": "DONE"}),
            ("put", self.task_url, {"project": self.project.pk, "title": "Changed"}),
            ("delete", self.task_url, {}),
            ("post", self.task_url + "comments/", {"body": "New"}),
            ("patch", comment_url, {"body": "Changed"}),
            ("delete", comment_url, {}),
        ]
        for method, url, payload in attempts:
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, payload, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn("archived", str(response.data))
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, "TODO")
        self.assertEqual(Task.objects.count(), 1)
        self.assertEqual(TaskComment.objects.get().body, "Keep this")
        self.assertEqual(TaskActivity.objects.count(), 1)

    def test_restore_reenables_writes_and_is_idempotent(self):
        self.archive()
        for _ in range(2):
            restored = self.client.post(self.base + "restore/")
            self.assertEqual(restored.status_code, 200)
            self.assertIsNone(restored.data["archived_at"])
        self.assertEqual(self.client.patch(self.base, {"name": "Active"}).status_code, 200)
        self.assertEqual(self.client.patch(self.task_url, {"status": "DONE"}).status_code, 200)
        self.assertEqual(self.client.post(self.task_url + "comments/", {"body": "Back"}).status_code, 201)

    def test_archive_state_cannot_be_set_through_normal_project_fields(self):
        response = self.client.patch(self.base, {"archived_at": "2026-10-08T12:00:00Z"})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["archived_at"])
        self.archive()
        self.assertEqual(self.client.patch(self.base, {"archived_at": None}, format="json").status_code, 400)

    def test_permanent_deletion_remains_separate_and_admin_only(self):
        self.archive()
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.delete(self.base).status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(self.base).status_code, 204)
        self.assertFalse(Task.objects.exists())
        self.assertFalse(TaskComment.objects.exists())
        self.assertFalse(TaskActivity.objects.exists())


    def test_removed_members_lose_access_and_archived_assignments_are_cleared(self):
        self.task.assigned_to = self.member
        self.task.save(update_fields=["assigned_to"])
        self.archive()
        membership = Membership.objects.get(user=self.member, organization=self.org)
        self.assertEqual(self.client.delete(f"/api/memberships/{membership.pk}/").status_code, 204)
        self.task.refresh_from_db()
        self.assertIsNone(self.task.assigned_to)
        self.assertEqual(TaskActivity.objects.count(), 2)
        for user in (self.member, self.outsider):
            self.client.force_authenticate(user)
            for url in (self.base, self.task_url, self.task_url + "comments/", self.task_url + "activity/"):
                self.assertEqual(self.client.get(url).status_code, 404)
            self.assertEqual(self.client.patch(self.task_url, {"status": "DONE"}).status_code, 404)
