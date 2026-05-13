import { get, route } from "remix/fetch-router/routes";

export const routes = route({
  assets: get("/assets/*path"),
  schema: get("/schema"),
  home: "/",
  auth: "/auth",
  debug: "/debug",
});
