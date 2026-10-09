//Connects to authentication backend
import { signIn, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { ArchieMark, Icon, StatusMessage } from "../components/ui";
import { isValidAuthEmail, normalizeAuthEmail } from "../lib/authEmail";

// "Beginner", "Intermediate", "Advanced" experience levels
import type { ExperienceLevel } from "../types";

// Provider marks for the icon-only social buttons (aria-hidden; the button carries the label)
function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.73c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.99.72 1.23-.02 2.01-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66l.03-.03ZM14.1 5.98c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.1 1.75-.96 2.79 1.01.08 2.05-.52 2.68-1.27Z" />
    </svg>
  );
}

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
  { name: "Apple", Mark: AppleMark },
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
  const [message, setMessage] = useState(""); 

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

  // handles Apple, Git, Google -> to sign in
  // Apple remains a placeholder until its OAuth provider is configured.
  const socialClick = (provider: string) => {
    setMessage(
      `${provider} authentication will be connected when OAuth is added.`,
    );
  };

  return (
    <main className="auth-page">
      {/* logo works as back button to return to the home page */}
      <button
        type="button"
        className="auth-brand"
        onClick={back}
        aria-label="Back to ARCHITECT home"
      >
        <ArchieMark size={24} />
        <span>ARCHITECT</span>
      </button>

      {/* authentication form section */}
      <section className="auth-shell">
        <form className="auth-form" onSubmit={submit}>
          {/* Heading */}
          <div className="auth-heading">
            <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>

            <p>
              {isSignup
                ? "Start building better systems with ARCHITECT."
                : "Sign in to continue to ARCHITECT."}
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
                    : name === "Google"
                      ? signIn("google", { callbackUrl: "/" })
                      : socialClick(name)
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
                message.includes("will be") || // ex) Google auth will be ... -> info
                message.includes("available")
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
              By creating an account, you agree to ARCHITECT&apos;s{" "}
              <button type="button">Terms of Service</button> and{" "}
              <button type="button">Privacy Policy</button>.
            </p>
          )}

          {/* Switch */}
          <p className="auth-switch">
            {isSignup ? "Already have an account?" : "New to ARCHITECT?"}{" "}
            <button type="button" onClick={switchKind}>
              {isSignup ? "Sign in" : "Create account"}
            </button>
          </p>
        </form>
      </section>
    </main>
  );
}

// Step 1 rows; order and copy are presentation only, the value is the ExperienceLevel
const EXPERIENCE_OPTIONS: ReadonlyArray<{
  level: ExperienceLevel;
  index: string;
  description: string;
}> = [
  { level: "Beginner", index: "01", description: "I'm learning how systems fit together." },
  { level: "Intermediate", index: "02", description: "I understand the basics and want to practice designing systems." },
  { level: "Advanced", index: "03", description: "I'm comfortable with system design and want more challenging scenarios." },
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
      <header className="onboarding-bar">
        {/* ARCHITECT branding */}
        <div className="onboarding-brand">
          <ArchieMark size={24} />
          <span>ARCHITECT</span>
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
                  What best describes your <br />
                  system design experience?
                </h1>

                <p>We&apos;ll tailor ARCHITECT to your experience.</p>
              </div>

              {/* native radios: one selection, arrow-key navigation */}
              <fieldset className="onboarding-options">
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

                      <span className="onboarding-option-index" aria-hidden="true">
                        {option.index}
                      </span>

                      <span className="onboarding-option-copy">
                        <span className="onboarding-option-title">{option.level}</span>
                        <span className="onboarding-option-description">
                          {option.description}
                        </span>
                      </span>

                      <span className="onboarding-option-radio" aria-hidden="true" />
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

          {/* STEP 2 — GITHUB CONNECTION */}
          {step === 2 && (
            <div className="onboarding-github">
              <span className="onboarding-github-icon">
                <GitHubMark />
              </span>

              <div className="onboarding-heading">
                <h1 ref={headingRef} tabIndex={-1}>
                  Bring your work with you.
                </h1>

                <p>
                  Connect GitHub to link your development workflow with
                  ARCHITECT.
                </p>
              </div>

              <ul className="onboarding-benefits">
                <li>
                  <Icon name="check" size={14} />
                  Connect your repositories
                </li>
                <li>
                  <Icon name="check" size={14} />
                  Bring project context into ARCHITECT
                </li>
                <li>
                  <Icon name="check" size={14} />
                  Keep your development workflow connected
                </li>
              </ul>

              <button
                type="button"
                className="onboarding-primary"
                onClick={connectGitHub}
              >
                <GitHubMark />
                Connect GitHub
                <Icon name="arrow" size={16} />
              </button>

              <button
                type="button"
                className="onboarding-text-button"
                onClick={skipGitHub}
                disabled={isSaving}
              >
                Skip for now
              </button>

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
            </div>
          )}
        </div>
      </section>
    </main>
  );
}