import assert from "node:assert/strict";
import test from "node:test";

import { filterProjects } from "../src/components/projects/projectSearch.ts";
import type { Project } from "../src/components/projects/projectStore.ts";

const project = (title: string, labels: string[] = []) => ({
  id: title,
  title,
  nodes: labels.map((label) => ({ data: { label } })),
}) as unknown as Project;

const shortener = project("URL shortener", ["Load balancer", "Redis", "Postgres"]);
const chat = project("Chat service", ["Kafka", "Redis"]);
const empty = project("Untitled");
const projects = [shortener, chat, empty];
const titles = (query: string) => filterProjects(projects, query).map((item) => item.title);

test("an empty or blank search keeps every project in order", () => {
  assert.equal(filterProjects(projects, ""), projects);
  assert.equal(filterProjects(projects, "   "), projects);
});

test("search matches part of a title in any case", () => {
  assert.deepEqual(titles("SHORT"), ["URL shortener"]);
});

test("search finds the projects using a component", () => {
  assert.deepEqual(titles("redis"), ["URL shortener", "Chat service"]);
});

test("every word must match, across the title and components, in any order", () => {
  assert.deepEqual(titles("redis chat"), ["Chat service"]);
  assert.deepEqual(titles("balancer url"), ["URL shortener"]);
  assert.deepEqual(titles("kafka shortener"), []);
});

test("regular expression characters are plain text", () => {
  assert.deepEqual(titles(".*"), []);
});

test("search returns nothing when no project matches", () => {
  assert.deepEqual(titles("cassandra"), []);
});
