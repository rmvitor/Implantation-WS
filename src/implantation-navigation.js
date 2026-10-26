export const implantationNavigationKey = (account, project) =>
  `implanta.acceptance.navigation.v1:${account || "local"}:${project}`;
export function acceptanceNavigation(value = {}) {
  return {
    filter: ["technical", "both", "open"].includes(value.filter)
      ? value.filter
      : "all",
    entity: typeof value.entity === "string" ? value.entity : "",
    modules:
      value.modules &&
      typeof value.modules === "object" &&
      !Array.isArray(value.modules)
        ? Object.fromEntries(
            Object.entries(value.modules).filter(
              ([, v]) => typeof v === "string",
            ),
          )
        : {},
    entitiesCollapsed: value.entitiesCollapsed === true,
    modulesCollapsed: value.modulesCollapsed === true,
  };
}
export function readAcceptanceNavigation(storage, key) {
  try {
    return acceptanceNavigation(JSON.parse(storage.getItem(key) || "{}"));
  } catch {
    return acceptanceNavigation();
  }
}
