/// <reference types="vite/client" />
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      SHOPIFY_API_KEY: string;
      SHOPIFY_API_SECRET: string;
      SHOPIFY_APP_URL: string;
      SCOPES: string;
      SUPABASE_URL: string;
      SUPABASE_SERVICE_KEY: string;
      SUPABASE_ANON_KEY: string;
      REMOVE_BG_API_KEY: string;
      PUPPETEER_EXECUTABLE_PATH: string;
      TRIGGER_PROG_REF: string;
      TRIGGER_API_URL: string;
      TRIGGER_SECRET: string;
      PRODUCT_STATUS_BYPASS_IDS?: string;
    }
  }
}


declare const __SHOPIFY_API_KEY__: string;
declare const __APP_PUBLIC_ENV__: {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
};
