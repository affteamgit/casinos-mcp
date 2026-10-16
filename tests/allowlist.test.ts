import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAllowlist, isAllowed, assertAllowed } from "../lib/allowlist.ts";

test("parseAllowlist splits on commas, trims, lowercases and drops empties", () => {
  assert.deepEqual(parseAllowlist(" A@Example.com, google-oauth2|123 ,, "), ["a@example.com", "google-oauth2|123"]);
  assert.deepEqual(parseAllowlist(undefined), []);
  assert.deepEqual(parseAllowlist(""), []);
});

test("isAllowed matches the token email case-insensitively", () => {
  const list = parseAllowlist("me@example.com");
  assert.equal(isAllowed({ sub: "google-oauth2|1", email: "ME@example.com" }, list), true);
  assert.equal(isAllowed({ sub: "google-oauth2|1", email: "other@example.com" }, list), false);
});

test("isAllowed matches the token sub when the email claim is absent", () => {
  const list = parseAllowlist("google-oauth2|1");
  assert.equal(isAllowed({ sub: "google-oauth2|1" }, list), true);
  assert.equal(isAllowed({ sub: "google-oauth2|2" }, list), false);
});

test("isAllowed denies everyone when the list is empty (fail closed)", () => {
  assert.equal(isAllowed({ sub: "google-oauth2|1", email: "me@example.com" }, []), false);
});

test("assertAllowed reads the raw env value and names the denied sub", () => {
  assert.doesNotThrow(() => assertAllowed({ sub: "google-oauth2|1", email: "me@example.com" }, "me@example.com"));
  assert.throws(() => assertAllowed({ sub: "google-oauth2|9", email: "x@example.com" }, "me@example.com"), /not on the allowlist.*google-oauth2\|9/);
  assert.throws(() => assertAllowed({ sub: "google-oauth2|1", email: "me@example.com" }, undefined), /MCP_ALLOWED_USERS is empty/);
});
