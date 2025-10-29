import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { FullScreenSpinner } from "../ui/FullScreenSpinner";

const HOST_STORAGE_KEY = "shopify-host";

export interface ShopifyRuntimeConfig {
  apiKey: string;
  host: string;
}

const ShopifyAppBridgeContext = createContext<ShopifyRuntimeConfig | null>(null);

function resolveHost(search: string) {
  const params = new URLSearchParams(search);
  return params.get("host");
}

export function ShopifyAppBridgeProvider({ children }: PropsWithChildren) {
  const location = useLocation();
  const [host, setHost] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;

    const fromUrl = resolveHost(window.location.search);
    if (fromUrl) {
      sessionStorage.setItem(HOST_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(HOST_STORAGE_KEY);
  });
  const [missingHost, setMissingHost] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = resolveHost(location.search);
    if (fromUrl && fromUrl !== host) {
      sessionStorage.setItem(HOST_STORAGE_KEY, fromUrl);
      setHost(fromUrl);
      setMissingHost(false);
      return;
    }
    const stored = sessionStorage.getItem(HOST_STORAGE_KEY);
    if (stored) {
      if (stored !== host) {
        setHost(stored);
      }
      setMissingHost(false);
      return;
    }
    setMissingHost(true);
  }, [location.search, host]);

  const value = useMemo<ShopifyRuntimeConfig | null>(() => {
    if (!host) return null;
    return {
      apiKey: __SHOPIFY_API_KEY__,
      host,
    };
  }, [host]);

  if (!value) {
    if (missingHost) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            height: "100vh",
            gap: "0.75rem",
            textAlign: "center",
            padding: "1.5rem",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Missing Shopify context</h1>
          <p style={{ margin: 0, maxWidth: 420 }}>
            We could not determine the `host` parameter for the embedded app.
            Please relaunch the app from your Shopify admin so it can load in the correct context.
          </p>
        </div>
      );
    }

    return <FullScreenSpinner label="Preparing Shopify context" />;
  }

  return (
    <ShopifyAppBridgeContext.Provider value={value}>
      {children}
    </ShopifyAppBridgeContext.Provider>
  );
}

export function useShopifyAppBridge() {
  const context = useContext(ShopifyAppBridgeContext);
  if (!context) {
    throw new Error("useShopifyAppBridge must be used within ShopifyAppBridgeProvider");
  }
  return context;
}
