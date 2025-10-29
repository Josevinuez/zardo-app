import type { UploadHandler } from "@remix-run/node";
import { unstable_createFileUploadHandler } from "@remix-run/node";

export const standardFileUploadHandler =
  unstable_createFileUploadHandler({
    directory: "public/uploads",
  });

export const fileUploadHandler: UploadHandler = (args) => {
  return standardFileUploadHandler(args);
};
