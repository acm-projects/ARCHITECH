import assert from "node:assert/strict";
import test from "node:test";
import { createChallengeIntroState } from "../src/components/challenge/challengeIntro.ts";

test("challenge introduction is absent in Learn and remembered per project and challenge after reopen", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const state = createChallengeIntroState(() => storage);
  assert.equal(state.shouldShow("learn", "p1", "url-shortener"), false);
  assert.equal(state.shouldShow("challenge", "p1", "url-shortener"), true);
  state.acknowledge("p1", "url-shortener");
  assert.equal(state.shouldShow("challenge", "p1", "url-shortener"), false);
  const reopened = createChallengeIntroState(() => storage);
  assert.equal(reopened.shouldShow("challenge", "p1", "url-shortener"), false);
  assert.equal(reopened.shouldShow("challenge", "p2", "url-shortener"), true);
  assert.equal(reopened.shouldShow("challenge", "p1", "another-challenge"), true);
});

test("blocked storage still allows dismissing the introduction for the current session", () => {
  const state = createChallengeIntroState(() => null);
  assert.equal(state.shouldShow("challenge", "p1", "c1"), true);
  state.acknowledge("p1", "c1");
  assert.equal(state.shouldShow("challenge", "p1", "c1"), false);
});
