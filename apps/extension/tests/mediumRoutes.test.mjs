import assert from "node:assert/strict";
import test from "node:test";
import { isMediumAuthenticationUrl } from "../dist/mediumRoutes.js";

test("recognizes current and legacy Medium authentication routes", () => {
  const routes = [
    "https://medium.com/m/signin",
    "https://medium.com/m/signin?operation=register",
    "https://medium.com/signin",
    "https://www.medium.com/signup",
    "https://medium.com/join"
  ];
  for (const route of routes) assert.equal(isMediumAuthenticationUrl(route), true, route);
});

test("does not treat Medium profile or unrelated hosts as authentication routes", () => {
  const routes = [
    "https://medium.com/me/settings",
    "https://medium.com/@entitymanager",
    "https://example.com/m/signin",
    "not-a-url"
  ];
  for (const route of routes) assert.equal(isMediumAuthenticationUrl(route), false, route);
});
