import { Outlet, ScrollRestoration } from "react-router-dom";
import { AppProviders } from "../providers/AppProviders";

export function RootLayout() {
  return (
    <AppProviders>
      <ScrollRestoration />
      <Outlet />
    </AppProviders>
  );
}
