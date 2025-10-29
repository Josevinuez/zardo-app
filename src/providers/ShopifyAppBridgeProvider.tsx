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
    
    // In development, allow bypassing host requirement
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isDev) {
      // Generate a mock host for development
      const mockHost = sessionStorage.getItem(HOST_STORAGE_KEY) || btoa('zardotest.myshopify.com.admin');
      sessionStorage.setItem(HOST_STORAGE_KEY, mockHost);
      return mockHost;
    }
    
    const fromUrl = resolveHost(window.location.search);
    if (fromUrl) {
      sessionStorage.setItem(HOST_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(HOST_STORAGE_KEY);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = resolveHost(location.search);
    if (fromUrl && fromUrl !== host) {
      sessionStorage.setItem(HOST_STORAGE_KEY, fromUrl);
      setHost(fromUrl);
    }
  }, [location.search, host]);

  const value = useMemo<ShopifyRuntimeConfig | null>(() => {
    if (!host) return null;
    return {
      apiKey: __SHOPIFY_API_KEY__,
      host,
    };
  }, [host]);

  if (!value) {
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
