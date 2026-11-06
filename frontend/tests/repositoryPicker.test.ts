import assert from "node:assert/strict";
import test from "node:test";
import { parseRepositoryUrl, readRepositories } from "../src/lib/github/repositoryPicker.ts";
import { createProjectStore } from "../src/components/projects/projectStore.ts";

test("repository URLs accept GitHub repository roots and reject other destinations", () => {
  assert.deepEqual(parseRepositoryUrl(" https://github.com/acme/api.git/ "), { owner: "acme", repo: "api" });
  for (const value of ["http://github.com/acme/api", "https://github.com.evil.test/acme/api", "https://user@github.com/acme/api", "https://github.com/acme/api/tree/main", "https://github.com/acme/api?token=x", "https://github.com/acme/..", "not a url"]) {
    assert.equal(parseRepositoryUrl(value), null, value);
  }
});

test("repository responses are validated before rendering or importing", () => {
  assert.deepEqual(readRepositories([{ id: 12, full_name: "acme/api", private: true }]), [{ id: 12, fullName: "acme/api", owner: "acme", repo: "api", private: true }]);
  assert.throws(() => readRepositories({ error: "failed" }));
  assert.throws(() => readRepositories([{ id: 12, full_name: "../api", private: false }]));
});

test("an imported project keeps its server id and survives reopening without replacing existing work", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const store = createProjectStore({ getStorage: () => storage, newId: () => "local-project" });
  const local = store.createProject();
  const imported = { ...local, id: "server-project", source: "github", learnSkipped: true, title: "acme/api" };
  store.receiveProject(imported);
  const reopened = createProjectStore({ getStorage: () => storage });
  assert.equal(reopened.getProject("server-project")?.title, "acme/api");
  assert.equal(reopened.getProject("server-project")?.source, "github");
  assert.equal(reopened.getProject("server-project")?.learnSkipped, true);
  assert.equal(reopened.getProject(local.id)?.title, local.title);
  assert.throws(() => store.receiveProject({ id: "invalid" }));
  assert.equal(store.listProjects().length, 2);
});
