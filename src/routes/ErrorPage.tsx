import { isRouteErrorResponse, useRouteError } from "react-router-dom";

export function ErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div style={styles.container}>
        <h1>Something went wrong</h1>
        <p>
          {error.status} {error.statusText}
        </p>
      </div>
    );
  }

  if (error instanceof Error) {
    return (
      <div style={styles.container}>
        <h1>Unexpected error</h1>
        <pre>{error.message}</pre>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1>Application error</h1>
      <p>We hit an unexpected state. Try refreshing the page.</p>
    </div>
  );
}

const styles = {
  container: {
    display: "grid",
    placeItems: "center",
    padding: "4rem 1.5rem",
    textAlign: "center" as const,
    gap: "1rem",
  },
};
