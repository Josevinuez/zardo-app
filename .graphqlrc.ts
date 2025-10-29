import fs from "node:fs";
import { USING_API_VERSION } from "./app/shopify.server";
import { shopifyApiProject, ApiType } from "@shopify/api-codegen-preset";
import type { IGraphQLConfig } from "graphql-config";

function getConfig() {
  const config: IGraphQLConfig = {
    projects: {
      default: shopifyApiProject({
        apiType: ApiType.Admin,
        apiVersion: USING_API_VERSION,
        documents: ["./app/**/*.{js,ts,jsx,tsx}", "./app/.server/**/*.{js,ts,jsx,tsx}"],
        outputDir: "./app/types",
      }),
    },
  };

  let extensions: string[] = [];
  try {
    extensions = fs.readdirSync("./extensions");
  } catch {
    // ignore if no extensions
  }

  for (const entry of extensions) {
    const extensionPath = `./extensions/${entry}`;
    const schema = `${extensionPath}/schema.graphql`;
    if (!fs.existsSync(schema)) {
      continue;
    }
    config.projects[entry] = {
      schema,
      documents: [`${extensionPath}/**/*.graphql`],
    };
  }

  return config;
}

module.exports = getConfig();
