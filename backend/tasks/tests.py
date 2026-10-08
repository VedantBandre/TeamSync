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
