import { useState, type FormEvent } from "react";

import { ProductHeader } from "../components/ProductShell";
import { ArchieMark, Button, Choice, Field, Icon, StatusMessage, TextInput } from "../components/ui";
import {
  readJsonStorage,
  STORAGE_KEYS,
  writeJsonStorage,
} from "../lib/storage";
import type { ExperienceLevel } from "../types";

interface LocalUser {
  name?: string;
}

export function AuthPage({
  kind,
  back,
  done,
  switchKind,
}: {
  kind: "signin" | "signup";
  back: () => void;
  done: () => void;
  switchKind: () => void;
}) {
  const setup = kind === "signup";
  const existing = readJsonStorage<LocalUser>(STORAGE_KEYS.user, {});
  const [name, setName] = useState(existing.name ?? "");
  const [message, setMessage] = useState("");
  const canSubmit = setup ? name.trim().length >= 2 : Boolean(existing.name?.trim());

  const submit = (event?: FormEvent) => {
    event?.preventDefault();

    if (!canSubmit) {
      setMessage(
        setup
          ? "Enter a name with at least 2 characters."
          : "No local profile exists in this browser yet.",
      );
      return;
    }

    if (setup) {
      writeJsonStorage(STORAGE_KEYS.user, { name: name.trim() });
    }
    done();
  };

  return (
    <main className="auth-page">
      <ProductHeader
        onLogoClick={back}
        trail={<span className="product-location">{setup ? "Set up" : "Sign in"}</span>}
        actions={(
          <Button variant="ghost" size="sm" className="product-header-link" onClick={switchKind}>
            {setup ? "Open existing workspace" : "Set up local profile"}
          </Button>
        )}
      />
      <section className="auth-shell">
        <form className="auth-card" onSubmit={submit}>
          <h2>{setup ? "Set up this browser" : "Open your workspace"}</h2>
          <p>
            {setup
              ? "Choose the name ARCHITEch should show in this browser."
              : existing.name
                ? `Continue as ${existing.name}. Your projects are stored locally in this browser.`
                : "There is no local ARCHITEch profile in this browser yet."}
          </p>

          {setup ? (
            <Field label="Display name">
              <TextInput
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          ) : (
            existing.name && (
              <StatusMessage className="form-message">
                Local profile · {existing.name}
              </StatusMessage>
            )
          )}

          {message && (
            <StatusMessage tone="error" className="form-message">
              {message}
            </StatusMessage>
          )}

          <Button type="submit" disabled={!canSubmit} className={!canSubmit ? "is-muted" : ""}>
            {setup ? "Save local profile" : "Open workspace"} <Icon name="arrow" />
          </Button>

          <small>
            No account is created. Profile and project data stay in this browser.
          </small>

          {!canSubmit && !setup && (
            <Button type="button" variant="ghost" size="sm" className="auth-switch" onClick={switchKind}>
              Set up a local profile <Icon name="arrow" size={14} />
            </Button>
          )}
        </form>
      </section>
    </main>
  );
}

export function Onboarding({
  level,
  setLevel,
  done,
}: {
  level: ExperienceLevel;
  setLevel: (value: ExperienceLevel) => void;
  done: () => void;
}) {
  return (
    <main className="onboarding">
      <ProductHeader trail={<span className="product-location">Workspace setup</span>} />
      <div className="onboard-card">
        <h1>Choose workspace depth</h1>
        <p>Sets the default level of explanation and architecture review.</p>
        <div className="level-grid">
          {([
            ["Beginner", "Fundamentals and guided explanations"],
            ["Intermediate", "Standard architecture workflow"],
            ["Advanced", "Production-level assumptions and concise review"],
          ] as const).map(([name, desc]) => (
            <Choice key={name} className="level-card" selected={level === name} onClick={() => setLevel(name)}>
              <span className="level-top">
                <ArchieMark
                  variant={
                    name === "Beginner"
                      ? "beginner"
                      : name === "Intermediate"
                        ? "intermediate"
                        : "advanced"
                  }
                  size={34}
                />
                <b>{name}</b>
              </span>
              <span>{desc}</span>
              <i>{level === name && <Icon name="check" size={14} />}</i>
            </Choice>
          ))}
        </div>
        <div className="onboard-foot">
          <span />
          <Button onClick={done}>Open workspace <Icon name="arrow" /></Button>
        </div>
      </div>
      <div className="progress complete"><span /></div>
    </main>
  );
}
