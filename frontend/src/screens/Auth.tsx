//Connects to authentication backend
import { signIn, useSession } from "next-auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import AuthIntroduction from "../components/auth/AuthIntroduction";
import "../components/auth/auth-introduction.css";

import { Icon, Logo, StatusMessage } from "../components/ui";
import { OnboardingArchie, useArchieEyes } from "../components/auth/OnboardingArchie";
import { isValidAuthEmail, normalizeAuthEmail } from "../lib/authEmail";

// "Beginner", "Intermediate", "Advanced" experience levels
import type { ExperienceLevel } from "../types";

// Provider marks for the icon-only social buttons (aria-hidden; the button carries the label)
function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49l-.01-1.7c-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.66.35-1.12.64-1.37-2.22-.26-4.56-1.14-4.56-5.05 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.92-2.34 4.79-4.57 5.04.36.32.68.94.68 1.9l-.01 2.81c0 .27.18.6.69.49A10.1 10.1 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" />
    </svg>
  );
}

const SOCIAL_PROVIDERS = [
  { name: "GitHub", Mark: GitHubMark },
  { name: "Google", Mark: GoogleMark },
] as const;

/*App.tsx -> sends information/functions -> AuthPage
  AuthPage receives four props:
  1. kind: "signin" | "signup" - tells this component which version it should display
  2. back: () => void - go back to the previous page
  3. done: () => void - auth is done, move to next
  4. switchKind: () => void - switch between signin and signup
 */

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
  const isSignup = kind === "signup"; // if kind = "signup", true; otherwise, false

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // to make password hidden by default
  const [remember, setRemember] = useState(false); // for backend, not functioning yet
  // Some messages include a logo, so they aren't all strings.
  const [message, setMessage] = useState<ReactNode>("");

  // determines whether the main button should be enabled
  // have to meet requirements to enable the main button
  const canSubmit = isSignup
    ? name.trim().length >= 2 &&
      isValidAuthEmail(normalizeAuthEmail(email)) &&
      password.length >= 6
    : isValidAuthEmail(normalizeAuthEmail(email)) && password.length > 0;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage("");
    const normalizedEmail = normalizeAuthEmail(email);

    if (!isValidAuthEmail(normalizedEmail)) {
      setMessage("Enter a valid email address without spaces.");
      return;
    }

    try {
      if (isSignup) {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: normalizedEmail,
            password,
          }),
        });
        const body: { error?: string } = await response.json();

        if (!response.ok) {
          setMessage(body.error || "Unable to create your account. Please try again.");
          return;
        }
      }

      const result = await signIn("credentials", {
        redirect: false,
        email: normalizedEmail,
        password,
      });

      if (result?.error) {
        setMessage(result.error);
      } else {
        done();
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Authentication failed. Please try again.",
      );
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-shell auth-split-shell">
        <AuthIntroduction onBack={back} />
        <div className="auth-form-region">
        <form className="auth-form" onSubmit={submit}>
          {/* Heading */}
          <div className="auth-heading">
            <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>

            <p>
              {isSignup ? "Start building better systems with " : "Sign in to continue to "}
              <Logo variant="archie-without-props" size="inline" />.
            </p>
          </div>

          {/* Social sign in - icon only, provider named via aria-label/title */}
          <div className="auth-social-row">
            {SOCIAL_PROVIDERS.map(({ name, Mark }) => (
              <button
                key={name}
                type="button"
                className="auth-social-button"
                onClick={() =>
                  name === "GitHub"
                    ? signIn("github", { callbackUrl: "/dashboard" })
                    : signIn("google", { callbackUrl: "/" })
                }
                aria-label={`Continue with ${name}`}
                title={`Continue with ${name}`}
              >
                <Mark />
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="auth-divider" role="separator">
            or
          </div>

          {/* Sign up only */}
          {isSignup && (
            <label className="auth-field">
              <span>Name</span>

              <input
                type="text"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}

          {/* Email */}
          <label className="auth-field">
            <span>Email</span>

            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => {
                const normalizedEmail = normalizeAuthEmail(email);
                setEmail(normalizedEmail);
                setMessage(
                  normalizedEmail && !isValidAuthEmail(normalizedEmail)
                    ? "Enter a valid email address without spaces."
                    : "",
                );
              }}
            />
          </label>

          {/* Password */}
          <label className="auth-field">
            <span>Password</span>

            <div className="auth-password">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={isSignup ? "new-password" : "current-password"}
                // helps the brower/password manager understand whether this is new pwd or existing one
                placeholder={
                  isSignup ? "At least 6 characters" : "Enter your password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />

              <button
                type="button"
                className="auth-show-password"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                <Icon
                  name={showPassword ? "eyeoff" : "eye"} // hidden or visible password icon
                  size={18}
                />
              </button>
            </div>
          </label>

          {/* Sign in options */}
          {!isSignup && (
            <div className="auth-options">
              <label className="auth-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />

                <span>Remember me</span>
              </label>

              <button
                type="button"
                className="auth-text-button"
                onClick={() =>
                  setMessage(
                    // placeholder message for password recovery
                    "Password recovery will be available when authentication is connected.",
                  )
                }
              >
                Forgot password?
              </button>
            </div>
          )}

          {/* Message */}
          {message && (
            <StatusMessage
              tone={
                // Check the wording only when the message is plain text.
                typeof message === "string" &&
                (message.includes("will be") || message.includes("available"))
                  ? undefined
                  : "error" // ex) No profile exists -> error
              }
              className="auth-message"
            >
              {message}
            </StatusMessage>
          )}

          {/* Main CTA */}
          <button type="submit" className="auth-submit" disabled={!canSubmit}>
            {isSignup ? "Create account" : "Sign in"}
            <Icon name="arrow" size={16} />
          </button>

          {/* Legal */}
          {isSignup && (
            <p className="auth-legal">
              By creating an account, you agree to <Logo variant="archie-without-props" size="inline" />&apos;s{" "}
              <button type="button">Terms of Service</button> and{" "}
              <button type="button">Privacy Policy</button>.
            </p>
          )}

          {/* Switch */}
          <p className="auth-switch">
            {isSignup ? "Already have an account?" : <>New to <Logo variant="archie-without-props" size="inline" />?</>}{" "}
            <button type="button" onClick={switchKind}>
              {isSignup ? "Sign in" : "Create account"}
            </button>
          </p>
        </form>
        </div>
      </section>
    </main>
  );
}

// Experience choices share the same values used by the saved profile.
const EXPERIENCE_OPTIONS: ReadonlyArray<{
  level: ExperienceLevel;
  image: string;
  description: string;
}> = [
  { level: "Beginner", image: "/onboarding/beginner.svg", description: "I'm learning how systems fit together." },
  { level: "Intermediate", image: "/onboarding/intermediate.svg", description: "I understand the basics and want to practice designing systems." },
  { level: "Advanced", image: "/onboarding/advanced.svg", description: "I'm comfortable with system design and want more challenging scenarios." },
];

// Step 2 offers the same kind of choice as step 1: where the first design comes from.
type StartingPoint = "github" | "scratch";
const STARTING_POINTS: Array<{
  value: StartingPoint;
  title: string;
  image: string;
  description: string;
}> = [
  { value: "github", title: "Import from GitHub", image: "/onboarding/github.svg", description: "Pick a repository and map its services and dependencies onto the canvas." },
  { value: "scratch", title: "Start from scratch", image: "/onboarding/scratch.svg", description: "Begin with an empty canvas and add each component yourself." },
];

/* BACKEND INTEGRATION:
   The selected experience level is saved to the authenticated user's profile
   before the optional GitHub connection step.

   level- what's selected
   setLevel - change selected level
   done - finish this onboarding step */
export function Onboarding({
  level,
  setLevel,
  step,
  setStep,
  onboardingStarted,
  done,
}: {
  level: ExperienceLevel;
  setLevel: (value: ExperienceLevel) => void;
  step: 1 | 2;
  setStep: (value: 1 | 2) => void;
  onboardingStarted: () => void;
  done: () => void;
}) {
  const optionsRef = useRef<HTMLFieldSetElement>(null);
  useArchieEyes(optionsRef, step === 1);
  const startingPointsRef = useRef<HTMLFieldSetElement>(null);
  useArchieEyes(startingPointsRef, step === 2);
  const [startingPoint, setStartingPoint] = useState<StartingPoint>("github");

  const { update } = useSession();
  const [onboardingError, setOnboardingError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Move focus to the new heading when the step changes so keyboard and
  // screen-reader users land at the top of the new step (not on first render).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  /*
     BACKEND INTEGRATION — EXPERIENCE LEVEL
    
     The selected experience level is saved to the authenticated user's
     profile before moving to Step 2.
    
     Frontend provides:
     {
       experienceLevel: level
     }
    
     The profile API validates the level and updates the signed-in user's
     database record before continuing.
   */
  const continueToGitHub = async () => {
     onboardingStarted();
     setOnboardingError("");
     setIsSaving(true);
    try {
      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceLevel: level }),
      });
      const result: { error?: string } = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to save your experience level.");
      }

      setStep(2);
      const session = await update();
      if (!session?.user?.experienceLevel) {
        setOnboardingError(
          "Your experience level was saved, but the session could not be refreshed. You can continue and try again later.",
        );
      }
    } catch (error) {
      setOnboardingError(
        error instanceof Error
          ? error.message
          : "Unable to save your experience level. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const connectGitHub = () => {
    void signIn("github", { callbackUrl: "/dashboard" }).catch((error: unknown) => {
      setOnboardingError(
        error instanceof Error
          ? error.message
          : "Unable to connect GitHub. Please try again.",
      );
    });
  };

  const skipGitHub = () => {
    done();
  };

  return (
    <main className="onboarding">
      <header className="page-header onboarding-bar">
        {/* One header for both onboarding steps. */}
        <div className="onboarding-brand logo">
          <Logo variant="with-archie" />
        </div>

        {/* Step counter: 01 / 02 -> 02 / 02 */}
        <span className="onboarding-step" aria-label={`Step ${step} of 2`}>
          <b>0{step}</b> / 02
        </span>
      </header>

      <section className="onboarding-shell">
        {/* key={step} remounts the panel so each step fades in at the same position */}
        <div className="onboarding-panel" key={step}>
          {/* STEP 1 — EXPERIENCE LEVEL */}
          {step === 1 && (
            <>
              <div className="onboarding-heading">
                <h1 ref={headingRef} tabIndex={-1}>
                  What best describes your system design experience?
                </h1>

              </div>

              {/* native radios: one selection, arrow-key navigation */}
              <fieldset ref={optionsRef} className="onboarding-options">
                <legend className="onboarding-sr-only">System design experience</legend>

                {EXPERIENCE_OPTIONS.map((option) => {
                  const selected = level === option.level;

                  return (
                    <label
                      key={option.level}
                      className={`onboarding-option ${selected ? "is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="experience-level"
                        className="onboarding-option-input"
                        value={option.level}
                        checked={selected}
                        onChange={() => setLevel(option.level)}
                      />

                      {/* The label already names the level, so the illustration is decorative. */}
                      <OnboardingArchie src={option.image} />

                      <span className="onboarding-option-copy">
                        <span className="onboarding-option-title">{option.level}</span>
                        <span className="onboarding-option-description">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              <button
                type="button"
                className="onboarding-primary"
                onClick={continueToGitHub}
                disabled={!level || isSaving}
              >
                Continue
                <Icon name="arrow" size={16} />
              </button>

              <p className="onboarding-note">You can change this later in settings.</p>

              {onboardingError && (
                <StatusMessage tone="error" className="onboarding-message">
                  {onboardingError}
                </StatusMessage>
              )}
            </>
          )}

          {/* STEP 2 — STARTING POINT (GitHub import or an empty canvas) */}
          {step === 2 && (
            <>
              <div className="onboarding-heading">
                <h1 ref={headingRef} tabIndex={-1}>
                  How do you want to start?
                </h1>
              </div>

              <fieldset ref={startingPointsRef} className="onboarding-options" data-count="2">
                <legend className="onboarding-sr-only">Starting point</legend>

                {STARTING_POINTS.map((option) => {
                  const selected = startingPoint === option.value;

                  return (
                    <label
                      key={option.value}
                      className={`onboarding-option ${selected ? "is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="starting-point"
                        className="onboarding-option-input"
                        value={option.value}
                        checked={selected}
                        onChange={() => setStartingPoint(option.value)}
                      />

                      <OnboardingArchie src={option.image} />

                      <span className="onboarding-option-copy">
                        <span className="onboarding-option-title">{option.title}</span>
                        <span className="onboarding-option-description">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              {startingPoint === "github" ? (
                <button type="button" className="onboarding-primary" onClick={connectGitHub}>
                  <GitHubMark />
                  Connect GitHub
                  <Icon name="arrow" size={16} />
                </button>
              ) : (
                <button type="button" className="onboarding-primary" onClick={skipGitHub} disabled={isSaving}>
                  Continue
                  <Icon name="arrow" size={16} />
                </button>
              )}

              <p className="onboarding-note">You can import a repository later from New project.</p>

              <button
                type="button"
                className="onboarding-back"
                onClick={() => setStep(1)}
              >
                <Icon name="arrow" size={14} />
                Back
              </button>

              {onboardingError && (
                <StatusMessage tone="error" className="onboarding-message">
                  {onboardingError}
                </StatusMessage>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
