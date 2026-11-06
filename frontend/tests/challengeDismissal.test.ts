import assert from "node:assert/strict";
import test from "node:test";

import { urlShortenerChallenge } from "../src/components/challenge/challenges.ts";
import {
  DISMISSED_CHALLENGE_COOKIE,
  dismissalCookie,
  isChallengeDismissed,
} from "../src/components/dashboard/challengeDismissal.ts";

test("the dismissal cookie is scoped to the dashboard and lasts a year", () => {
  assert.equal(
    dismissalCookie("url-shortener", false),
    `${DISMISSED_CHALLENGE_COOKIE}=url-shortener; Path=/dashboard; Max-Age=31536000; SameSite=Lax`,
  );
});

test("the dismissal cookie is marked secure over https", () => {
  assert.match(dismissalCookie("url-shortener", true), /; Secure$/);
  assert.doesNotMatch(dismissalCookie("url-shortener", false), /Secure/);
});

test("an id cannot add cookie attributes", () => {
  const cookie = dismissalCookie("a; Path=/; Domain=example.com", false);
  assert.equal(cookie.split("; ").length, 4);
  assert.doesNotMatch(cookie, /Domain=/);
});

test("only the dismissed challenge stays hidden", () => {
  assert.equal(isChallengeDismissed("url-shortener", "url-shortener"), true);
  assert.equal(isChallengeDismissed("rate-limiter", "url-shortener"), false);
  assert.equal(isChallengeDismissed(undefined, "url-shortener"), false);
  assert.equal(isChallengeDismissed("", "url-shortener"), false);
});

test("the featured challenge announces its real scale", () => {
  assert.equal(urlShortenerChallenge.announcement, "Design a URL shortener for 100M redirects a day");
  assert.ok(urlShortenerChallenge.requirements.includes("100M redirects per day"));
});
