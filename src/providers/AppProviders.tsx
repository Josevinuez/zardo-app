import { PropsWithChildren } from "react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { ShopifyAppBridgeProvider } from "./ShopifyAppBridgeProvider";

// Note: @shopify/shopify-app-react-router is installed but we keep the hybrid setup
// with Express for the backend. The package is available if you want to migrate
// to full React Router SSR in the future.

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <PolarisProvider i18n={enTranslations}>
      <ShopifyAppBridgeProvider>{children}</ShopifyAppBridgeProvider>
    </PolarisProvider>
  );
}
