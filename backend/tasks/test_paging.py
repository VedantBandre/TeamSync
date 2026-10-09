from datetime import timedelta
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase
from organizations.models import Membership, Organization
from projects.models import Project
from .models import Task


class TaskPagingTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="pager")
        self.other = User.objects.create_user(username="outside")
        self.org = Organization.objects.create(name="Visible", created_by=self.user)
        Membership.objects.create(user=self.user, organization=self.org, role="ADMIN")
        self.project = Project.objects.create(name="Board", organization=self.org)
        private = Organization.objects.create(name="Private", created_by=self.other)
        Membership.objects.create(user=self.other, organization=private, role="ADMIN")
        self.private = Project.objects.create(name="Hidden", organization=private)
        Task.objects.create(project=self.private, title="Private task")
        self.client.force_authenticate(self.user)
        self.url = f"/api/tasks/?project={self.project.pk}"

    def test_pages_are_bounded_stable_and_summary_counts_all_pages(self):
        Task.objects.bulk_create([Task(project=self.project, title=f"Task {i}", status="DONE" if i % 2 else "TODO") for i in range(67)])
        first = self.client.get(self.url).data
        second = self.client.get(self.url + "&page=2").data
        self.assertEqual(first["count"], 67)
        self.assertEqual(len(first["results"]), 50)
        self.assertEqual(len(second["results"]), 17)
        self.assertFalse({t["id"] for t in first["results"]} & {t["id"] for t in second["results"]})
        summary = self.client.get(f"/api/tasks/summary/?project={self.project.pk}").data
        self.assertEqual(summary["all"], {"total": 67, "TODO": 34, "IN_PROGRESS": 0, "DONE": 33})

    def test_combined_search_assignment_priority_and_deadline_filter(self):
        now = timezone.now()
        match = Task.objects.create(project=self.project, title="Plan launch", description="A clear story", assigned_to=self.user, priority="HIGH", due_date=now - timedelta(hours=1))
        Task.objects.create(project=self.project, title="Plan launch", priority="HIGH", status="DONE", due_date=now - timedelta(hours=1))
        response = self.client.get("/api/tasks/", {"project": self.project.pk, "search": "CLEAR", "assignee": self.user.pk, "priority": "HIGH", "due_before": now.isoformat(), "incomplete": "true"})
        self.assertEqual([task["id"] for task in response.data["results"]], [match.pk])
        summary = self.client.get(f"/api/tasks/summary/?project={self.project.pk}&search=CLEAR").data
        self.assertEqual(summary["all"]["total"], 2)
        self.assertEqual(summary["filtered"]["total"], 1)

    def test_no_deadline_includes_completed_and_unassigned_filter(self):
        task = Task.objects.create(project=self.project, title="Done", status="DONE")
        Task.objects.create(project=self.project, title="Assigned", assigned_to=self.user)
        result = self.client.get(self.url + "&no_due_date=true&assignee=unassigned").data
        self.assertEqual([row["id"] for row in result["results"]], [task.pk])

    def test_timezone_bounds_are_half_open_and_preserve_local_day(self):
        start = timezone.datetime(2026, 10, 9, tzinfo=timezone.get_fixed_timezone(120))
        before = Task.objects.create(project=self.project, title="Before", due_date=start - timedelta(seconds=1))
        within = Task.objects.create(project=self.project, title="Inside", due_date=start)
        Task.objects.create(project=self.project, title="After", due_date=start + timedelta(days=1))
        result = self.client.get("/api/tasks/", {"project": self.project.pk, "due_from": start.isoformat(), "due_before": (start + timedelta(days=1)).isoformat()}).data
        self.assertEqual([row["id"] for row in result["results"]], [within.pk])
        self.assertNotEqual(before.pk, within.pk)

    def test_invalid_filters_rejected_and_writes_ignore_list_filters(self):
        for suffix in ("priority=CRITICAL", "assignee=-1", "assignee=" + "9" * 50, "due_from=yesterday", "due_before=2026-10-09T00:00:00", "project=bad", "search=" + "a" * 201):
            with self.subTest(suffix=suffix):
                self.assertEqual(self.client.get(self.url + "&" + suffix).status_code, 400)
        task = Task.objects.create(project=self.project, title="Editable")
        self.assertEqual(self.client.patch(f"/api/tasks/{task.pk}/?priority=CRITICAL", {"title": "Saved"}).status_code, 200)

    def test_private_project_is_not_disclosed_by_list_or_summary(self):
        for path in ("tasks", "tasks/summary"):
            self.assertEqual(self.client.get(f"/api/{path}/?project={self.private.pk}").status_code, 404)
        self.assertEqual(self.client.get("/api/tasks/?page=1").data["count"], 0)
