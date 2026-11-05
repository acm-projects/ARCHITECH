import type { Project } from "./projectStore";

// A project matches on its title or the components in its design, so "redis" finds every
// system using one. Each word must appear, in any order.
function searchableText(project: Project): string {
  return [project.title, ...project.nodes.map((node) => node.data.label ?? "")].join(" ").toLocaleLowerCase();
}

export function filterProjects(projects: Project[], query: string): Project[] {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return projects;
  return projects.filter((project) => {
    const text = searchableText(project);
    return terms.every((term) => text.includes(term));
  });
}
