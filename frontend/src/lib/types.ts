export interface Profile {
  display_name?: string;
  nickname?: string;
  status?: string;
  status_emoji?: string;
  avatar?: string | null;
}
export interface User extends Profile {
  id: number;
  username: string;
  email: string;
  email_verified?: boolean;
  email_recovery_available?: boolean;
}
export interface Organization {
  id: number;
  name: string;
  created_by: number;
  created_at: string;
}
export interface Membership {
  profile?: Profile;
  id: number;
  user: number;
  username: string;
  organization: number;
  role: "ADMIN" | "MEMBER";
}
export interface Project {
  archived_at: string | null;
  id: number;
  name: string;
  description: string;
  organization: number;
  created_at: string;
}
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export const priorities: { value: TaskPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];
export interface Task {
  id: number;
  title: string;
  description: string;
  project: number;
  assigned_to: number | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_at: string;
}
export interface WorkspaceData {
  organizations: Organization[];
  memberships: Membership[];
  projects: Project[];
  tasks: Task[];
}
export const statuses: { value: TaskStatus; label: string }[] = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];

export interface TaskComment {
  id: number;
  task: number;
  author: number | null;
  author_name: string;
  body: string;
  created_at: string;
  updated_at: string;
}
export interface TaskActivity {
  id: number;
  actor: number | null;
  actor_name: string;
  kind:
    | "CREATED"
    | "UPDATED"
    | "COMMENT_ADDED"
    | "COMMENT_EDITED"
    | "COMMENT_DELETED";
  changes: Record<string, { from: string | null; to: string | null }>;
  created_at: string;
}
export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
export interface TaskCounts {
  total: number;
  TODO: number;
  IN_PROGRESS: number;
  DONE: number;
}
export interface TaskSummary {
  all: TaskCounts;
  filtered: TaskCounts;
  revision: number;
}

export interface Invitation {
  id: number;
  organization: number;
  organization_name: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
  state: "ACTIVE" | "ACCEPTED" | "EXPIRED" | "REVOKED";
}
export interface InvitationPreview {
  organization: number;
  organization_name: string;
  expires_at: string;
  already_member: boolean;
  role: "MEMBER";
}
