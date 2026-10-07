import EntryFlowLoader from "@/components/auth/EntryFlowLoader";

// The landing page, sign in, sign up and onboarding. A browser that is already signed in is
// sent on to /dashboard (see EntryFlow).
export default function Page() {
  return <EntryFlowLoader />;
}
