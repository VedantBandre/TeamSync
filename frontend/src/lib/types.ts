export interface User {
  id: number;
  username: string;
  email: string;
}
export interface Organization {
  id: number;
  name: string;
  created_by: number;
  created_at: string;
}
export interface Membership {
  id: number;
  user: number;
  username: string;
  organization: number;
  role: "ADMIN" | "MEMBER";
}
export interface Project {
  id: number;
  name: string;
  description: string;
  organization: number;
  created_at: string;
}
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export interface Task {
  id: number;
  title: string;
  description: string;
  project: number;
  assigned_to: number | null;
  status: TaskStatus;
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
