import { z } from "zod";
export const NotificationSchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    length: z.number().default(3000),
});
// export const NotificationEvent = "notification";
