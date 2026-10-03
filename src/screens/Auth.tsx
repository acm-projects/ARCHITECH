// useState - lets page remember temporary values while user interacts
import { useState, type FormEvent } from "react";

import { ArchieMark, Button, Icon, StatusMessage } from "../components/ui";

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
      ARCHITECT currently uses a local browser profile rather than
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
        "No ARCHITECT profile exists in this browser yet. Create an account first.",
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

  // background decorations - no functionality for now
  return (
    <main className="auth-page">
      {/* Background decoration */}
      <div className="auth-background" aria-hidden="true">
        <span className="auth-dot auth-dot-1" />
        <span className="auth-dot auth-dot-2" />
        <span className="auth-dot auth-dot-3" />

        <span className="auth-line auth-line-1" />
        <span className="auth-line auth-line-2" />
      </div>

      {/* logo works as back button to return to the home page */}
      <button
        type="button"
        className="auth-brand"
        onClick={back}
        aria-label="Back to ARCHITECT home"
      >
        <ArchieMark size={28} />
        <span>ARCHITECT</span>
      </button>

      {/* authentication form section */}
      <section className="auth-shell">
        <form className="auth-card auth-card-new" onSubmit={submit}>
          {/* Logo */}
          <div className="auth-card-brand">
            <ArchieMark size={32} />
            <span>ARCHITECT</span>
          </div>

          {/* Heading */}
          <div className="auth-heading">
            <h1>
              {isSignup
                ? "Create your ARCHITECT account"
                : "Sign in to ARCHITECT"}
            </h1>

            <p>
              {isSignup
                ? "Start designing systems that actually scale."
                : "Continue building better systems."}
            </p>
          </div>

          {/* Social sign in */}
          <div className="auth-social-row">
            <button
              type="button"
              className="auth-social-button"
              onClick={() => socialClick("Apple")}
              aria-label="Continue with Apple"
            >
              <span className="auth-social-symbol apple-symbol">●</span>
              <span className="auth-social-label">Apple</span>
            </button>

            <button
              type="button"
              className="auth-social-button"
              onClick={() => socialClick("GitHub")}
              aria-label="Continue with GitHub"
            >
              <Icon name="git" size={19} />
              <span className="auth-social-label">GitHub</span>
            </button>

            <button
              type="button"
              className="auth-social-button"
              onClick={() => socialClick("Google")} // call it only when click happens
              aria-label="Continue with Google"
            >
              <span className="google-symbol">G</span>
              <span className="auth-social-label">Google</span>
            </button>
          </div>

          {/* Divider */}
          <div className="auth-divider">
            <span />
            <p>OR CONTINUE WITH EMAIL</p>
            <span />
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
              >
                <Icon
                  name={showPassword ? "eyeoff" : "eye"} // hidden or visible password icon
                  size={17}
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
                  : "error"                   // ex) No profile exists -> error
              }
              className="form-message auth-message"
            >
              {message}
            </StatusMessage>
          )}

          {/* Main CTA */}
          <Button
            type="submit"
            className="auth-submit"
            disabled={!canSubmit}
          >
            {isSignup ? "Create account" : "Sign in"}

            <Icon name="arrow" size={16} />
          </Button>

          {/* Legal */}
          {isSignup && (
            <p className="auth-legal">
              By creating an account, you agree to ARCHITECT's{" "}
              <button type="button">Terms of Service</button>
              {" "}and{" "}
              <button type="button">Privacy Policy</button>.
            </p>
          )}

          {/* Switch */}
          <div className="auth-switch-new">
            <span>
              {isSignup
                ? "Already have an account?"
                : "Don't have an account?"}
            </span>

            <button type="button" onClick={switchKind}>
              {isSignup ? "Sign in" : "Create account"}
              <Icon name="arrow" size={14} />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

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
  return (
    <main className="onboarding">
      <div className="onboarding-brand">
        <ArchieMark size={30} />
        <span>ARCHITEch</span>
      </div>

      <section className="onboarding-shell">
        <div className="onboard-card onboarding-level-card">
          <div className="onboarding-progress-header">
            <span>PERSONALIZE YOUR EXPERIENCE</span>
            <span>1 of 2</span>
          </div>

          <div className="onboarding-progress-track">
            <span />
          </div>

          <div className="onboarding-heading">
            <h1>How comfortable are you with system design?</h1>

            <p>
              We'll adjust explanations, challenges, and architecture feedback
              to your experience.
            </p>
          </div>

          <div className="level-grid level-grid-new">
            <button
              type="button"
              className={`level-card-new ${
                level === "Beginner" ? "selected" : ""
              }`}
              onClick={() => setLevel("Beginner")}
            >
              <div className="level-card-icon">
                <ArchieMark variant="beginner" size={46} />
              </div>

              <div className="level-card-copy">
                <div className="level-card-title">
                  <h3>Beginner</h3>

                  {level === "Beginner" && (
                    <span className="level-check">
                      <Icon name="check" size={14} />
                    </span>
                  )}
                </div>

                <p>I'm new to system design.</p>

                <ul>
                  <li>Guided explanations</li>
                  <li>More hints</li>
                  <li>Fundamental challenges</li>
                </ul>
              </div>
            </button>

            <button
              type="button"
              className={`level-card-new ${
                level === "Intermediate" ? "selected" : ""
              }`}
              onClick={() => setLevel("Intermediate")}
            >
              <div className="level-card-icon">
                <ArchieMark variant="intermediate" size={46} />
              </div>

              <div className="level-card-copy">
                <div className="level-card-title">
                  <h3>Intermediate</h3>

                  {level === "Intermediate" && (
                    <span className="level-check">
                      <Icon name="check" size={14} />
                    </span>
                  )}
                </div>

                <p>I understand the core components.</p>

                <ul>
                  <li>Balanced guidance</li>
                  <li>Architecture trade-offs</li>
                  <li>Realistic constraints</li>
                </ul>
              </div>
            </button>

            <button
              type="button"
              className={`level-card-new ${
                level === "Advanced" ? "selected" : ""
              }`}
              onClick={() => setLevel("Advanced")}
            >
              <div className="level-card-icon">
                <ArchieMark variant="advanced" size={46} />
              </div>

              <div className="level-card-copy">
                <div className="level-card-title">
                  <h3>Advanced</h3>

                  {level === "Advanced" && (
                    <span className="level-check">
                      <Icon name="check" size={14} />
                    </span>
                  )}
                </div>

                <p>I'm comfortable designing systems.</p>

                <ul>
                  <li>Minimal hints</li>
                  <li>Harder constraints</li>
                  <li>Deeper architecture review</li>
                </ul>
              </div>
            </button>
          </div>

          <div className="onboard-foot onboarding-foot-new">
            <span>
              You can change this later in settings.
            </span>

            <Button onClick={done}>
              Continue
              <Icon name="arrow" size={16} />
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}