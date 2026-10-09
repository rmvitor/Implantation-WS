export function orderedProjects(projects, order = []) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const result = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (!byId.has(id)) continue;
    result.push(byId.get(id));
    byId.delete(id);
  }
  return [...result, ...byId.values()];
}

export function reorderProjects(workspace, sourceId, targetId) {
  const ordered = orderedProjects(workspace.projects, workspace.projectOrder);
  const source = ordered.findIndex((project) => project.id === sourceId);
  const target = ordered.findIndex((project) => project.id === targetId);
  if (source < 0 || target < 0 || source === target) return workspace;
  const [project] = ordered.splice(source, 1);
  ordered.splice(target, 0, project);
  return { ...workspace, projectOrder: ordered.map((project) => project.id) };
}
