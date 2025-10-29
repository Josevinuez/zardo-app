export type UploadHandler = (args: unknown) => Promise<unknown> | unknown;

export const standardFileUploadHandler: UploadHandler = async () => undefined;

export const fileUploadHandler: UploadHandler = (args) => standardFileUploadHandler(args);
