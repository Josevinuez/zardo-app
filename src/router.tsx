import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "./routes/RootLayout";
import { LandingPage } from "./routes/LandingPage";
import { ErrorPage } from "./routes/ErrorPage";
import { AppLayout } from "./routes/app/AppLayout";
import { DashboardPage, dashboardLoader } from "./routes/app/DashboardPage";
import PSAImportPage from "./routes/app/PSAImportPage";
import TrollToadPage from "./routes/app/TrollToadPage";
import ManualProductsPage from "./routes/app/ManualProductsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <LandingPage />,
      },
      {
        path: "app",
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <DashboardPage />,
            loader: dashboardLoader,
          },
          {
            path: "psa",
            element: <PSAImportPage />,
          },
          {
            path: "trolltoad",
            element: <TrollToadPage />,
          },
          {
            path: "manual",
            element: <ManualProductsPage />,
          },
        ],
      },
    ],
  },
]);
