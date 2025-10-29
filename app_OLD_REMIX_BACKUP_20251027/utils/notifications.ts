import { z } from "zod";

export type NotificationEvent = {
    length: number;
    title: string;
    id: number;
    type: NotificationType;
    shown: boolean;
  }

export const NotificationSchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    length: z.number().default(3000),
});

export type NotificationType = "PSA" | "TROLL" | "MANUAL";

// export const NotificationEvent = "notification";
