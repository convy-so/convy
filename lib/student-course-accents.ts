/** Shared initials for course tiles (sidebar, dashboard, classes). */
export function classroomInitials(title: string) {
  const trimmed = title.trim();
  if (!trimmed) return "CL";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0];
    const b = parts[1]?.[0];
    const pair = `${a ?? ""}${b ?? ""}`.toUpperCase();
    return pair || "CL";
  }
  return trimmed.slice(0, 2).toUpperCase() || "CL";
}
