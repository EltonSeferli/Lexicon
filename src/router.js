const routes = new Set(["library", "progress"]);

export function getRoute() {
  const route = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return routes.has(route) ? route : "library";
}

export function navigate(route) {
  const nextRoute = routes.has(route) ? route : "library";
  if (getRoute() === nextRoute) return;
  window.location.hash = `/${nextRoute}`;
}

export function subscribeToRoute(callback) {
  const handleRouteChange = () => callback(getRoute());
  window.addEventListener("hashchange", handleRouteChange);
  return () => window.removeEventListener("hashchange", handleRouteChange);
}
