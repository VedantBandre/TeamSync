from django.db.models import Q
from django.utils.dateparse import parse_datetime
from django.utils.timezone import is_aware
from rest_framework.exceptions import ValidationError


def positive_id(value, field):
    if len(value) > 19 or not value.isascii() or not value.isdigit() or not 0 < int(value) < 2**63:
        raise ValidationError({field: "Use a positive ID."})
    return int(value)


def filter_tasks(queryset, params):
    search = params.get("search", "").strip()
    if len(search) > 200:
        raise ValidationError({"search": "Use at most 200 characters."})
    if search:
        queryset = queryset.filter(Q(title__icontains=search) | Q(description__icontains=search))
    for name, choices in (("status", ("TODO", "IN_PROGRESS", "DONE")),
                          ("priority", ("LOW", "MEDIUM", "HIGH", "URGENT"))):
        value = params.get(name)
        if value:
            if value not in choices:
                raise ValidationError({name: "Choose a valid value."})
            queryset = queryset.filter(**{name: value})
    assignee = params.get("assignee")
    if assignee:
        queryset = queryset.filter(assigned_to=None if assignee == "unassigned" else positive_id(assignee, "assignee"))
    if "no_due_date" in params:
        if params["no_due_date"] != "true":
            raise ValidationError({"no_due_date": "Use true or omit this filter."})
        queryset = queryset.filter(due_date__isnull=True)
    for name, lookup in (("due_from", "due_date__gte"), ("due_before", "due_date__lt")):
        if name in params:
            try:
                value = parse_datetime(params[name])
            except (ValueError, OverflowError):
                value = None
            if value is None or not is_aware(value):
                raise ValidationError({name: "Use an ISO timestamp with a timezone."})
            queryset = queryset.filter(**{lookup: value})
    if "incomplete" in params:
        if params["incomplete"] != "true":
            raise ValidationError({"incomplete": "Use true or omit this filter."})
        queryset = queryset.exclude(status="DONE")
    return queryset
