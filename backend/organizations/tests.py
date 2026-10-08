from unittest.mock import patch

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from .models import Organization, Membership
from projects.models import Project
from tasks.models import Task


class TeamWorkflowTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin")
        self.member = User.objects.create_user(username="member")
        self.outsider = User.objects.create_user(username="outsider")
        self.org = Organization.objects.create(name="Team A", created_by=self.admin)
        self.other_org = Organization.objects.create(name="Team B", created_by=self.outsider)
        self.admin_membership = Membership.objects.create(user=self.admin, organization=self.org, role="ADMIN")
        self.member_membership = Membership.objects.create(user=self.member, organization=self.org)
        Membership.objects.create(user=self.outsider, organization=self.other_org, role="ADMIN")
        self.project = Project.objects.create(name="Project A", organization=self.org)
        self.other_project = Project.objects.create(name="Project B", organization=self.other_org)
        self.task = Task.objects.create(title="Task A", project=self.project)
        self.other_task = Task.objects.create(title="Task B", project=self.other_project)
        self.client.force_authenticate(self.admin)

    def test_organization_creation_sets_owner_and_admin(self):
        response = self.client.post("/api/organizations/", {"name": "New team", "created_by": self.outsider.pk})
        self.assertEqual(response.status_code, 201)
        org = Organization.objects.get(pk=response.data["id"])
        self.assertEqual(org.created_by, self.admin)
        self.assertTrue(Membership.objects.filter(user=self.admin, organization=org, role="ADMIN").exists())

    def test_organization_and_initial_membership_are_created_atomically(self):
        with patch("organizations.views.Membership.objects.create", side_effect=RuntimeError("Creation failed")):
            with self.assertRaises(RuntimeError):
                self.client.post("/api/organizations/", {"name": "Rolled back"})
        self.assertFalse(Organization.objects.filter(name="Rolled back").exists())

    def test_lists_are_scoped_to_membership(self):
        for endpoint, expected in (("organizations", [self.org.pk]), ("memberships", [self.admin_membership.pk, self.member_membership.pk]), ("projects", [self.project.pk]), ("tasks", [self.task.pk])):
            with self.subTest(endpoint=endpoint):
                response = self.client.get(f"/api/{endpoint}/")
                self.assertEqual(response.status_code, 200)
                self.assertCountEqual([row["id"] for row in response.data], expected)

    def test_outsider_cannot_read_update_or_delete_team_objects(self):
        self.client.force_authenticate(self.outsider)
        for endpoint, obj in (("organizations", self.org), ("memberships", self.member_membership), ("projects", self.project), ("tasks", self.task)):
            for method in ("get", "patch", "delete"):
                with self.subTest(endpoint=endpoint, method=method):
                    response = getattr(self.client, method)(f"/api/{endpoint}/{obj.pk}/", {}, format="json")
                    self.assertEqual(response.status_code, 404)

    def test_outsider_cannot_create_in_another_team(self):
        self.client.force_authenticate(self.outsider)
        for endpoint, payload in (("memberships", {"organization": self.org.pk, "user": self.outsider.pk, "role": "ADMIN"}), ("projects", {"organization": self.org.pk, "name": "Unauthorized"}), ("tasks", {"project": self.project.pk, "title": "Unauthorized"})):
            with self.subTest(endpoint=endpoint):
                response = self.client.post(f"/api/{endpoint}/", payload)
                self.assertEqual(response.status_code, 400)
        self.assertFalse(Membership.objects.filter(user=self.outsider, organization=self.org).exists())

    def test_membership_response_includes_username(self):
        response = self.client.get(f"/api/memberships/{self.member_membership.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], self.member.username)
        self.assertEqual(response.data["user"], self.member.pk)

    def test_member_can_read_team_data(self):
        self.client.force_authenticate(self.member)
        for endpoint in ("organizations", "memberships", "projects", "tasks"):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self.client.get(f"/api/{endpoint}/").status_code, 200)

    def test_member_cannot_change_organization_or_project(self):
        self.client.force_authenticate(self.member)
        for endpoint, obj in (("organizations", self.org), ("projects", self.project)):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self.client.patch(f"/api/{endpoint}/{obj.pk}/", {"name": "Changed"}).status_code, 403)
                self.assertEqual(self.client.delete(f"/api/{endpoint}/{obj.pk}/").status_code, 403)
        self.assertEqual(self.client.post("/api/projects/", {"organization": self.org.pk, "name": "Unauthorized"}).status_code, 403)

    def test_member_cannot_manage_memberships_or_promote_self(self):
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.post("/api/memberships/", {"user": self.outsider.pk, "organization": self.org.pk}).status_code, 403)
        self.assertEqual(self.client.patch(f"/api/memberships/{self.member_membership.pk}/", {"role": "ADMIN"}).status_code, 403)
        self.assertEqual(self.client.delete(f"/api/memberships/{self.member_membership.pk}/").status_code, 403)
        self.member_membership.refresh_from_db()
        self.assertEqual(self.member_membership.role, "MEMBER")

    def test_admin_can_manage_project_and_organization(self):
        self.assertEqual(self.client.patch(f"/api/organizations/{self.org.pk}/", {"name": "Renamed"}).status_code, 200)
        response = self.client.post("/api/projects/", {"organization": self.org.pk, "name": "New project"})
        self.assertEqual(response.status_code, 201)
        url = f"/api/projects/{response.data['id']}/"
        self.assertEqual(self.client.patch(url, {"description": "Details"}).status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_admin_can_add_promote_and_remove_member(self):
        response = self.client.post("/api/memberships/", {"user": self.outsider.pk, "organization": self.org.pk})
        self.assertEqual(response.status_code, 201)
        url = f"/api/memberships/{response.data['id']}/"
        self.assertEqual(self.client.patch(url, {"role": "ADMIN"}).status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_duplicate_membership_is_rejected(self):
        response = self.client.post("/api/memberships/", {"user": self.member.pk, "organization": self.org.pk})
        self.assertEqual(response.status_code, 400)

    def test_membership_cannot_change_user_or_organization(self):
        Membership.objects.create(user=self.admin, organization=self.other_org, role="ADMIN")
        url = f"/api/memberships/{self.member_membership.pk}/"
        for payload in ({"user": self.outsider.pk}, {"organization": self.other_org.pk}):
            with self.subTest(payload=payload):
                self.assertEqual(self.client.patch(url, payload).status_code, 400)

    def test_last_admin_cannot_be_demoted_or_removed(self):
        url = f"/api/memberships/{self.admin_membership.pk}/"
        self.assertEqual(self.client.patch(url, {"role": "MEMBER"}).status_code, 400)
        self.assertEqual(self.client.delete(url).status_code, 400)
        self.admin_membership.refresh_from_db()
        self.assertEqual(self.admin_membership.role, "ADMIN")

    def test_admin_can_be_demoted_when_another_admin_exists(self):
        self.member_membership.role = "ADMIN"
        self.member_membership.save()
        self.assertEqual(self.client.patch(f"/api/memberships/{self.admin_membership.pk}/", {"role": "MEMBER"}).status_code, 200)

    def test_project_cannot_move_to_another_accessible_team(self):
        Membership.objects.create(user=self.admin, organization=self.other_org, role="ADMIN")
        response = self.client.patch(f"/api/projects/{self.project.pk}/", {"organization": self.other_org.pk})
        self.assertEqual(response.status_code, 400)

    def test_member_can_create_assign_update_and_delete_task(self):
        self.client.force_authenticate(self.member)
        response = self.client.post("/api/tasks/", {"project": self.project.pk, "title": "Ship feature", "assigned_to": self.admin.pk, "due_date": "2026-12-01T12:00:00Z"})
        self.assertEqual(response.status_code, 201)
        url = f"/api/tasks/{response.data['id']}/"
        for status in ("IN_PROGRESS", "DONE"):
            self.assertEqual(self.client.patch(url, {"status": status}).status_code, 200)
        self.assertEqual(self.client.patch(url, {"assigned_to": None}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_task_assignee_must_belong_to_its_team(self):
        # Even a user visible through another shared team is not a valid assignee.
        Membership.objects.create(user=self.admin, organization=self.other_org, role="ADMIN")
        response = self.client.post("/api/tasks/", {"project": self.project.pk, "title": "Bad assignment", "assigned_to": self.outsider.pk})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.patch(f"/api/tasks/{self.task.pk}/", {"assigned_to": self.outsider.pk}).status_code, 400)

    def test_task_cannot_move_to_another_accessible_project(self):
        second = Project.objects.create(name="Second", organization=self.org)
        self.assertEqual(self.client.patch(f"/api/tasks/{self.task.pk}/", {"project": second.pk}).status_code, 400)

    def test_invalid_task_status_is_rejected(self):
        self.assertEqual(self.client.patch(f"/api/tasks/{self.task.pk}/", {"status": "INVALID"}).status_code, 400)

    def test_anonymous_access_is_rejected(self):
        self.client.force_authenticate(None)
        for endpoint in ("organizations", "memberships", "projects", "tasks", "me"):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self.client.get(f"/api/{endpoint}/").status_code, 401)

    def test_removed_member_loses_access(self):
        self.task.assigned_to = self.member
        self.task.save()
        self.assertEqual(self.client.delete(f"/api/memberships/{self.member_membership.pk}/").status_code, 204)
        self.task.refresh_from_db()
        self.assertIsNone(self.task.assigned_to)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(f"/api/projects/{self.project.pk}/").status_code, 404)
        self.assertEqual(self.client.get("/api/tasks/").data, [])

    def test_organization_deletion_cascades_within_its_team(self):
        self.assertEqual(self.client.delete(f"/api/organizations/{self.org.pk}/").status_code, 204)
        self.assertFalse(Project.objects.filter(pk=self.project.pk).exists())
        self.assertFalse(Task.objects.filter(pk=self.task.pk).exists())
        self.assertTrue(Task.objects.filter(pk=self.other_task.pk).exists())
