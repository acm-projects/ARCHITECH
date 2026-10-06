import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ARCHITECH render error", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-error" role="alert">
        <div>
          <span>ARCHITECH</span>
          <h1>Something went wrong.</h1>
          <p>Your saved workspace is still stored locally. Reload the app to try again.</p>
          <button onClick={() => window.location.reload()}>Reload ARCHITECH</button>
        </div>
      </main>
    );
  }
}
