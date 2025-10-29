import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import {
  createReadableStreamFromReadable,
  type EntryContext,
} from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

// Log startup for automation tracking
console.log("🚀 SHOPIFY APP STARTING UP:", new Date().toISOString());
console.log("🤖 AUTOMATION FEATURES:");
console.log("  - Active/Draft automation: ACTIVE");
console.log("  - Webhook processing: ACTIVE");
console.log("  - PSA import: ACTIVE");
console.log("  - Scheduled inventory checks: ACTIVE");
console.log("📋 Environment check:");
console.log("  - NODE_ENV:", process.env.NODE_ENV);
console.log("  - SHOPIFY_APP_URL:", process.env.SHOPIFY_APP_URL ? "SET" : "MISSING");
console.log("  - DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "MISSING");
console.log("🎯 Ready to process webhooks and automation!");

const ABORT_DELAY = 10000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer
        context={remixContext}
        url={request.url}
        abortDelay={ABORT_DELAY}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          // responseHeaders.set("Access-Control-Allow-Origin", "https://extensions.shopifycdn.com")
          // responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization")
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
