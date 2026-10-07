// useState - lets page remember temporary values while user interacts
import { useEffect, useRef, useState, type FormEvent } from "react";

import { BrandWordmark, Icon, Logo, StatusMessage } from "../components/ui";

// just for the frontend stage
import {
  readJsonStorage,
  STORAGE_KEYS, // ex) STORAGE_KEYS.user
  writeJsonStorage,
} from "../lib/storage";

// "Beginner", "Intermediate", "Advanced" experience levels
import type { ExperienceLevel } from "../types";

/* BACKEND INTEGRATION:
   Once authentication is connected, the backend should define the actual
   user model returned by the authentication API
*/
interface LocalUser {
  name?: string; // ? means property is optional
  email?: string;
}

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

  // BACKEND INTEGRATION:
  // replace this as the source of authentication truth with the authenticated
  // user/session returned by the backend
  const existing = readJsonStorage<LocalUser>(STORAGE_KEYS.user, {}); // get existing user

  const [name, setName] = useState(existing.name ?? ""); // if existing.name is dne, use ""
  const [email, setEmail] = useState(existing.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // to make password hidden by default
  const [remember, setRemember] = useState(false); // for backend, not functioning yet
  const [message, setMessage] = useState(""); 

  // determines whether the main button should be enabled
  // have to meet requirements to enable the main button
  const canSubmit = isSignup
    ? name.trim().length >= 2 &&
      email.trim().length > 0 &&
      password.length >= 6
    : email.trim().length > 0 && password.length > 0;

  // runs when someone click main button (submit)
  /* BACKED INTEGRATION - EMAIL AUTHENTICATION
     This function currently simulates signup/signin using local storage.
     
     Sign up - frontend provides name, email, and password, which are stored locally.
     Backend should:
     1. validate the request
     2. check whether the email already exists
     3. securely hash the password
     4. create the user
     5. create/return an auth session
     6. return the created user

     Expected frontend flow:
     - post/api/auth/signup 
     - success
     - done
     - onboarding

     Sign in - frontend provides email and password, which are checked against locally stored profile.
     Backend should:
     1. Find the user
     2. validate the pwd
     3. create/return an auth session

     Error handling - backend errors should be returned in a form that the frontend can display to the user.    
                      can display using setMessage()
  */
  const submit = (event?: FormEvent) => {
    event?.preventDefault(); // prevent refresh, make user to stay on page
    setMessage(""); // clear message before moving on to next 

    // show message if the form cannot be submitted
    if (!canSubmit) {
      setMessage(
        isSignup
          ? "Enter your name, email, and a password with at least 6 characters." // signup
          : "Enter your email and password.", // signin
      );
      return;
    }

    /*
      ARCHITECH currently uses a local browser profile rather than
      a real authentication backend.

      For now, signup stores the profile locally and signin checks
      whether a local profile exists.

      current: react -> browser local storage
      after adding backend: react -> auth backend -> DB -> pwd handling
    */

    // saves user's name and email but not store the password yet
    /* Temp signup implementation
      replace this localstorage write with the real signup api call
    */
    if (isSignup) {
      writeJsonStorage(STORAGE_KEYS.user, {
        name: name.trim(),
        email: email.trim(),
      });

      done();
      return;
    }

    // Currently doesnt check entered main = saved email? or entered password = saved password?
    /*BACKEND INTEGRATION:
      replace this local profile check with the real signin api call
    */
    if (!existing.name) {
      setMessage(
        "No ARCHITECH profile exists in this browser yet. Create an account first.",
      );
      return;
    }

    done();
  };

  // handles Apple, Git, Google -> to sign in
  /*BACKEND INTEGRATION:
    replace this social sign in click handler with the real social signin api call
  */
  const socialClick = (provider: string) => {
    setMessage(
      `${provider} authentication will be connected when OAuth is added.`,
    );
  };

  return (
    <main className="auth-page">
      {/* logo works as back button to return to the home page */}
      <Logo
        className="auth-brand"
        onClick={back}
        aria-label="Back to ARCHITECH home"
      />

      {/* authentication form section */}
      <section className="auth-shell">
        <form className="auth-form" onSubmit={submit}>
          {/* Heading */}
          <div className="auth-heading">
            <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>

            <p>
              {isSignup
                ? "Start building better systems with ARCHITECH."
                : "Sign in to continue to ARCHITECH."}
            </p>
          </div>

          {/* Social sign in - icon only, provider named via aria-label/title */}
          <div className="auth-social-row">
            {SOCIAL_PROVIDERS.map(({ name, Mark }) => (
              <button
                key={name}
                type="button"
                className="auth-social-button"
                onClick={() => socialClick(name)} // call it only when click happens
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
              By creating an account, you agree to ARCHITECH's{" "}
              <button type="button">Terms of Service</button> and{" "}
              <button type="button">Privacy Policy</button>.
            </p>
          )}

          {/* Switch */}
          <p className="auth-switch">
            {isSignup ? "Already have an account?" : "New to ARCHITECH?"}{" "}
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
   The final selected experience level should be saved to the authenticated
   user's profile on the backend.

   level- what's selected
   setLevel - change selected level
   done - finish this onboarding step */
export function Onboarding({
  level,
  setLevel,
  done,
}: {
  level: ExperienceLevel;
  setLevel: (value: ExperienceLevel) => void;
  done: () => void;
}) {
  // Keeps track of which onboarding screen the user is currently viewing.
  // Step 1 = experience level
  // Step 2 = optional GitHub connection
  const [step, setStep] = useState<1 | 2>(1);

  // Message shown on the GitHub step.
  // For now this is only used to explain that OAuth is not connected yet.
  const [githubMessage, setGithubMessage] = useState("");

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
    
     The selected experience level should eventually be saved to the
     authenticated user's profile before moving to Step 2.
    
     Frontend provides:
     {
       experienceLevel: level
     }
    
     Example future flow:
    
     PATCH /api/users/me
            ↓
     backend saves experience level
            ↓
     success
            ↓
     setStep(2)
    
     For now, the level remains in frontend state and we immediately
     continue to Step 2.
   */
  const continueToGitHub = () => {
    setStep(2);
  };

  /*
     BACKEND INTEGRATION — GITHUB OAUTH
    
     This is currently only a frontend placeholder.
    
     Future expected flow:
    
     User clicks "Connect GitHub"
            ↓
     Start GitHub OAuth
            ↓
     User authorizes ARCHITECH
            ↓
     Backend receives OAuth callback
            ↓
     Backend associates GitHub account with authenticated user
            ↓
     Frontend continues to Home
    
     Do not treat the account as connected until OAuth succeeds.
   */
  const connectGitHub = () => {
    setGithubMessage(
      "GitHub connection will be available when OAuth is connected.",
    );
  };

  /*
     GitHub is optional.
    
     If the user skips this step, onboarding is considered complete
     and App.tsx's done() callback sends the user to Home.
    
     No GitHub account should be stored for users who skip.
   */
  const skipGitHub = () => {
    done();
  };

  return (
    <main className="onboarding">
      <header className="onboarding-bar">
        {/* ARCHITECH branding */}
        <div className="onboarding-brand logo">
          <BrandWordmark />
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

                <p>We'll tailor ARCHITECH to your experience.</p>
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
                disabled={!level}
              >
                Continue
                <Icon name="arrow" size={16} />
              </button>

              <p className="onboarding-note">You can change this later in settings.</p>
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
                  ARCHITECH.
                </p>
              </div>

              {/* what GitHub will enable once OAuth exists - not a connected state */}
              <ul className="onboarding-benefits">
                <li>
                  <Icon name="check" size={14} />
                  Connect your repositories
                </li>
                <li>
                  <Icon name="check" size={14} />
                  Bring project context into ARCHITECH
                </li>
                <li>
                  <Icon name="check" size={14} />
                  Keep your development workflow connected
                </li>
              </ul>

              {githubMessage && (
                <StatusMessage className="onboarding-message">
                  {githubMessage}
                </StatusMessage>
              )}

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
              >
                Skip for now
              </button>

              <button
                type="button"
                className="onboarding-back"
                onClick={() => {
                  setGithubMessage("");
                  setStep(1);
                }}
              >
                <Icon name="arrow" size={14} />
                Back
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
