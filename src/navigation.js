// Only screen identifiers belong in browser history. Drafts, records, credentials
// and personal data stay out; Back never replays a database operation.
export const NAVIGATION_KEY = "implanta.navigation.v1";
const GLOBAL_VIEWS = ["municipalities", "personalAgenda", "operations"];
const PROJECT_VIEWS = ["board", "homologation", "implantation", "agenda", "trainings", "history", "details"];
export const homeRoute = () => ({ view: "municipalities", projectId: "" });
export function screenRoute(view, projectId) {
  return { view, projectId: GLOBAL_VIEWS.includes(view) ? "" : projectId || "" };
}
export function availableRoute(route, projects) {
  if (GLOBAL_VIEWS.includes(route?.view)) return screenRoute(route.view);
  if (PROJECT_VIEWS.includes(route?.view) && projects.some((p) => p.id === route.projectId))
    return screenRoute(route.view, route.projectId);
  return homeRoute();
}
function entryFrom(state, scope, owner) {
  const entry = state?.[NAVIGATION_KEY];
  return entry?.scope === scope && (!owner || entry.owner === owner) &&
    Number.isSafeInteger(entry.index) && entry.index >= 0 && entry.route &&
    typeof entry.owner === "string" && ["screen", "layer"].includes(entry.kind)
    ? entry : null;
}
const equalRoute = (a, b) => a.view === b.view && a.projectId === b.projectId;

export function createNavigation(browser, scope) {
  const history = browser.history;
  const previous = entryFrom(history.state, scope);
  const owner = previous?.owner || browser.crypto.randomUUID();
  const layers = new Map();
  let current, started = false, maxIndex = previous?.index || 0;
  let returning = false, consumedLayer = false;
  const navigation = {
    renderedRoute: homeRoute(),
    resolve: (route) => route,
    restore: () => {},
    blocked: () => false,
    start() {
      if (started) return;
      started = true;
      current = { scope, owner, index: previous?.index || 0, kind: "screen", route: navigation.renderedRoute };
      write("replaceState", current);
      browser.addEventListener("popstate", pop);
    },
    stop() {
      started = false;
      layers.clear();
      browser.removeEventListener("popstate", pop);
    },
    syncRoute(route = navigation.renderedRoute) {
      navigation.start();
      if (returning || equalRoute(current.route, route)) return;
      push({ kind: "screen", route });
    },
    addLayer(close) {
      navigation.syncRoute();
      const id = `${owner}:${browser.crypto.randomUUID()}`;
      push({ kind: "layer", layer: id, route: navigation.renderedRoute });
      layers.set(id, { close, index: current.index });
      return id;
    },
    removeLayer(id) {
      layers.delete(id);
      if (!started || current.kind !== "layer" || current.layer !== id) return;
      const last = [...layers.keys()].at(-1);
      // Replacing avoids asynchronous history.back() racing with a save or
      // opening another screen. Identical screen entries are skipped on Back.
      current = { ...current, kind: last ? "layer" : "screen", layer: last, reusable: true };
      write("replaceState", current);
    },
  };
  function write(method, entry) {
    history[method]({ ...history.state, [NAVIGATION_KEY]: entry }, "");
  }
  function push(entry) {
    // Reuse a dismissed overlay's slot at the end of the stack, so repeatedly
    // opening cards does not accumulate hundreds of empty Back steps.
    const reuse = current.reusable && current.index === maxIndex;
    current = { scope, owner, index: current.index + (reuse ? 0 : 1), ...entry };
    maxIndex = current.index;
    write(reuse ? "replaceState" : "pushState", current);
  }
  function pop(event) {
    const destination = entryFrom(event.state, scope, owner);
    if (returning) {
      returning = false;
      navigation.syncRoute();
      return;
    }
    const backwards = !destination || destination.index < current.index;
    const closing = backwards ? [...layers.entries()].reverse().filter(([id, layer]) =>
      layer.index > (destination?.index ?? -1) || current.kind === "layer" && id === current.layer
    ) : [];
    let blocked = navigation.blocked();
    if (!blocked) for (const [id, layer] of closing) {
      if (layer.close() === false) { blocked = true; break; }
      layers.delete(id);
    }
    if (blocked) {
      returning = true;
      history.go(destination ? current.index - destination.index : 1);
      return;
    }
    consumedLayer ||= closing.length > 0;
    if (!destination) {
      current = { scope, owner, index: 0, kind: "screen", route: homeRoute() };
      maxIndex = 0;
      consumedLayer = false;
      write("replaceState", current);
      navigation.restore(current.route);
      return;
    }
    const previousRoute = current.route;
    current = destination;
    // A dismissed dialog is never reconstructed from history. This also
    // removes duplicate screens left by Save, Cancel or repeated menu use.
    const staleLayer = current.kind === "layer" && !layers.has(current.layer);
    const duplicateScreen = !consumedLayer && current.kind === "screen" && equalRoute(previousRoute, current.route);
    if ((staleLayer || duplicateScreen) && (backwards || current.index < maxIndex)) {
      history.go(backwards ? -1 : 1);
      return;
    }
    consumedLayer = false;
    const route = navigation.resolve(current.route);
    if (staleLayer || !equalRoute(route, current.route)) {
      current = { ...current, kind: "screen", layer: undefined, route };
      write("replaceState", current);
    }
    if (!equalRoute(previousRoute, route)) navigation.restore(route);
  }
  return navigation;
}
