import React, { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { availableRoute, createNavigation } from "./navigation.js";

export const NavigationContext = createContext(null);
export function useScreenNavigation({ scope, route, projects, onRestore, blocked }) {
  const [navigation] = useState(() => createNavigation(window, scope));
  navigation.renderedRoute = route;
  navigation.resolve = (candidate) => availableRoute(candidate, projects);
  navigation.restore = onRestore;
  navigation.blocked = blocked;
  useLayoutEffect(() => {
    navigation.start();
    return () => navigation.stop();
  }, [navigation]);
  useLayoutEffect(() => navigation.syncRoute(route), [navigation, route.view, route.projectId]);
  return navigation;
}
export function useBackLayer(active, onBack, explicitNavigation) {
  const context = useContext(NavigationContext);
  const navigation = explicitNavigation || context;
  const latest = useRef(onBack);
  latest.current = onBack;
  useLayoutEffect(() => {
    if (!active || !navigation) return;
    const id = navigation.addLayer(() => latest.current());
    return () => navigation.removeLayer(id);
  }, [active, navigation]);
}
