/* app/page.tsx delegates the actual authentication/onboarding behavior to EntryFlowLoader.
  this imports the component responsible for loading the landing/auth/onboarding flow.
  A browser that is already signed in is sent on to /dashboard (see EntryFlow).
*/
import EntryFlowLoader from "@/components/auth/EntryFlowLoader";

// Entry point of the '/' route -> Next.js routing
export default function Page() {
  return <EntryFlowLoader />;
}

