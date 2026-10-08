from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from organizations.models import Membership, Organization
from projects.models import Project
from .models import Task


class TaskPriorityTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="member")
        self.org = Organization.objects.create(name="Team", created_by=self.user)
        Membership.objects.create(user=self.user, organization=self.org)
        self.project = Project.objects.create(name="Project", organization=self.org)
        self.client.force_authenticate(self.user)

    def test_existing_clients_receive_default_priority(self):
        response = self.client.post("/api/tasks/", {"project": self.project.pk, "title": "Default"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["priority"], "MEDIUM")
        self.assertEqual(Task.objects.get(pk=response.data["id"]).priority, "MEDIUM")

    def test_member_can_create_and_change_priority(self):
        response = self.client.post("/api/tasks/", {"project": self.project.pk, "title": "Release", "priority": "HIGH"})
        self.assertEqual(response.status_code, 201)
        task_id = response.data["id"]
        response = self.client.patch(f"/api/tasks/{task_id}/", {"priority": "URGENT"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(f"/api/tasks/{task_id}/").data["priority"], "URGENT")

    def test_invalid_priority_does_not_modify_task(self):
        task = Task.objects.create(project=self.project, title="Release", priority="LOW")
        response = self.client.patch(f"/api/tasks/{task.pk}/", {"priority": "CRITICAL"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("priority", response.data)
        task.refresh_from_db()
        self.assertEqual(task.priority, "LOW")

    def test_outsider_cannot_change_priority(self):
        task = Task.objects.create(project=self.project, title="Release")
        outsider = User.objects.create_user(username="outsider")
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.patch(f"/api/tasks/{task.pk}/", {"priority": "URGENT"}).status_code, 404)


class TaskDiscussionTests(APITestCase):
    def setUp(self):
        from .models import TaskActivity, TaskComment
        self.Activity = TaskActivity
        self.Comment = TaskComment
        self.author = User.objects.create_user(username="author")
        self.member = User.objects.create_user(username="teammate")
        self.outsider = User.objects.create_user(username="outside")
        self.org = Organization.objects.create(name="Team", created_by=self.author)
        Membership.objects.create(user=self.author, organization=self.org, role="ADMIN")
        Membership.objects.create(user=self.member, organization=self.org)
        self.project = Project.objects.create(name="Project", organization=self.org)
        self.task = Task.objects.create(project=self.project, title="Release")
        self.base = f"/api/tasks/{self.task.pk}"
        self.client.force_authenticate(self.author)

    def add(self, body="An update"):
        return self.client.post(f"{self.base}/comments/", {"body": body}, format="json")

    def history(self):
        return self.client.get(f"{self.base}/activity/").data["results"]

    def test_comments_bind_author_and_task_on_server(self):
        response = self.client.post(f"{self.base}/comments/", {"body": "  Update  ", "author": self.outsider.pk, "author_name": "Forged", "task": 999}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["body"], "Update")
        self.assertEqual(response.data["author"], self.author.pk)
        self.assertEqual(response.data["author_name"], "author")
        self.assertEqual(response.data["task"], self.task.pk)
        self.assertEqual(response.data["updated_at"], response.data["created_at"])
        self.assertEqual(self.history()[0]["kind"], "COMMENT_ADDED")

    def test_comments_reject_blank_and_overlong_bodies(self):
        for body in ("", "   ", "x" * 4001):
            self.assertEqual(self.add(body).status_code, 400)
        self.assertEqual(self.Comment.objects.count(), 0)
        self.assertEqual(self.Activity.objects.count(), 0)

    def test_team_members_can_read_but_only_author_can_modify(self):
        comment = self.add().data
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(f"{self.base}/comments/").data["count"], 1)
        self.assertEqual(self.client.get(f"{self.base}/activity/").status_code, 200)
        for method in ("patch", "delete"):
            self.assertEqual(getattr(self.client, method)(f"{self.base}/comments/{comment['id']}/", {"body": "Tampered"}).status_code, 403)
        self.client.force_authenticate(self.author)
        response = self.client.patch(f"{self.base}/comments/{comment['id']}/", {"body": "Corrected"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["body"], "Corrected")
        self.assertEqual(self.client.delete(f"{self.base}/comments/{comment['id']}/").status_code, 204)
        self.assertEqual([event["kind"] for event in self.history()], ["COMMENT_DELETED", "COMMENT_EDITED", "COMMENT_ADDED"])
        self.assertEqual(self.history()[0]["changes"], {})

    def test_outsiders_and_removed_members_cannot_access_discussion(self):
        comment = self.add().data
        for user in (self.outsider, self.member):
            Membership.objects.filter(user=self.member).delete()
            self.client.force_authenticate(user)
            for suffix in ("comments", "activity"):
                self.assertEqual(self.client.get(f"{self.base}/{suffix}/").status_code, 404)
            self.assertEqual(self.add().status_code, 404)
            self.assertEqual(self.client.patch(f"{self.base}/comments/{comment['id']}/", {"body": "Tampered"}).status_code, 404)

    def test_comment_ids_cannot_move_between_tasks(self):
        comment = self.add().data
        other = Task.objects.create(project=self.project, title="Other")
        self.assertEqual(self.client.delete(f"/api/tasks/{other.pk}/comments/{comment['id']}/").status_code, 404)

    def test_task_events_record_actual_changes_and_ignore_noops(self):
        created = self.client.post("/api/tasks/", {"project": self.project.pk, "title": "New task"}).data
        self.assertEqual(self.Activity.objects.get(task_id=created["id"]).kind, "CREATED")
        self.client.force_authenticate(self.member)
        response = self.client.patch(f"{self.base}/", {"status": "DONE", "priority": "HIGH", "assigned_to": self.member.pk})
        self.assertEqual(response.status_code, 200)
        event = self.history()[0]
        self.assertEqual(event["actor_name"], "teammate")
        self.assertEqual(event["changes"]["status"], {"from": "TODO", "to": "DONE"})
        self.assertEqual(event["changes"]["assigned_to"], {"from": None, "to": "teammate"})
        count = self.Activity.objects.filter(task=self.task).count()
        self.client.patch(f"{self.base}/", {"status": "DONE"})
        self.assertEqual(self.Activity.objects.filter(task=self.task).count(), count)
        self.client.patch(f"{self.base}/", {"due_date": "2026-10-08T12:00:00Z"})
        count = self.Activity.objects.filter(task=self.task).count()
        self.client.patch(f"{self.base}/", {"due_date": "2026-10-08T14:00:00+02:00"})
        self.assertEqual(self.Activity.objects.filter(task=self.task).count(), count)

    def test_failed_validation_and_noop_comment_do_not_record_activity(self):
        comment = self.add().data
        response = self.client.patch(f"{self.base}/comments/{comment['id']}/", {"body": comment["body"]})
        self.assertEqual(response.data["updated_at"], comment["updated_at"])
        self.assertEqual(self.client.patch(f"{self.base}/", {"status": "INVALID"}).status_code, 400)
        self.assertEqual(len(self.history()), 1)

    def test_history_is_read_only_and_paged(self):
        for index in range(25):
            self.Activity.objects.create(task=self.task, actor=self.author, actor_name="author", kind="UPDATED")
            self.Comment.objects.create(task=self.task, author=self.author, author_name="author", body=f"Comment {index}")
        for suffix in ("comments", "activity"):
            first = self.client.get(f"{self.base}/{suffix}/").data
            self.assertEqual(first["count"], 25)
            self.assertEqual(len(first["results"]), 20)
            second = self.client.get(first["next"]).data
            self.assertEqual(len(second["results"]), 5)
            self.assertFalse(set(row["id"] for row in first["results"]) & set(row["id"] for row in second["results"]))
        self.assertEqual(self.client.post(f"{self.base}/activity/", {}).status_code, 405)

    def test_activity_failure_rolls_back_task_and_comment_writes(self):
        from unittest.mock import patch
        with patch("tasks.views.TaskActivity.objects.create", side_effect=RuntimeError("Unavailable")):
            with self.assertRaises(RuntimeError):
                self.client.patch(f"{self.base}/", {"priority": "URGENT"})
            with self.assertRaises(RuntimeError):
                self.add()
        self.task.refresh_from_db()
        self.assertEqual(self.task.priority, "MEDIUM")
        self.assertEqual(self.Comment.objects.count(), 0)

    def test_anonymous_access_is_denied(self):
        self.client.force_authenticate(None)
        for suffix in ("comments", "activity"):
            self.assertEqual(self.client.get(f"{self.base}/{suffix}/").status_code, 401)

    def test_membership_removal_records_automatic_unassignment(self):
        self.task.assigned_to = self.member
        self.task.save()
        membership = Membership.objects.get(user=self.member, organization=self.org)
        response = self.client.delete(f"/api/memberships/{membership.pk}/")
        self.assertEqual(response.status_code, 204)
        self.task.refresh_from_db()
        self.assertIsNone(self.task.assigned_to)
        event = self.history()[0]
        self.assertEqual(event["actor_name"], "author")
        self.assertEqual(event["changes"], {"assigned_to": {"from": "teammate", "to": None}})
