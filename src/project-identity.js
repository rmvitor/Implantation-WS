export const PROJECT_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#be185d",
  "#b45309",
  "#0e7490",
  "#c2410c",
  "#4338ca",
  "#a21caf",
];

export function projectColor(project) {
  if (
    typeof project?.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(project.color)
  )
    return project.color;
  let hash = 0;
  for (const character of String(project?.id || project?.name || ""))
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}
