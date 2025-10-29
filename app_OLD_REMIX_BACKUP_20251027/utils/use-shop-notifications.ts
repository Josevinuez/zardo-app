import { useAppBridge } from "@shopify/app-bridge-react";
import type { NotificationType } from "./notifications";
import { useEffect, useState } from "react";
import type {  NotificationEvent } from "~/utils/notifications";

async function clearNotification(id: number) {
	try {
		const response = await fetch(`/app/events/clear/${id}`, {
			method: "POST",
		});
		if (!response.ok) {
			throw new Error("Failed to clear notification");
		}
		return await response.json();
	} catch (error) {
		console.error("Error clearing notification:", error);
	}
}

export function useEventFetcher(type: NotificationType) {
	const [events, setEvents] = useState<NotificationEvent[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	

	useEffect(() => {
		let isMounted = true;
		const controller = new AbortController();

		async function fetchEvents() {
			setIsLoading(true);
			setError(null);

			try {
				const response = await fetch(`/app/events/fetch/${type}`, {
					signal: controller.signal,
				});

				if (!response.ok) {
					throw new Error("Failed to fetch events");
				}

				const data = await response.json();

				if (isMounted) {
					setEvents(data.results);
				}
			} catch (err) {
				if (isMounted && err instanceof Error) {
					setError(err.message);
				}
			} finally {
				if (isMounted) {
					setIsLoading(false);
				}
			}
		}

		fetchEvents();

		// Set up an interval to fetch events periodically (e.g., every 30 seconds)
		const intervalId = setInterval(fetchEvents, 5000);

		return () => {
			isMounted = false;
			controller.abort();
			clearInterval(intervalId);
		};
	}, [type]);

	useEffect(() => {
		const appBridge = useAppBridge();
		async function showNotification(event: NotificationEvent) {
			if (event.id && !event.shown) {
				// Display the notification
				appBridge.toast.show(event.title, { duration: event.length });

				// Mark the notification as shown
				await clearNotification(event.id);

				// Remove the event from the local state
				setEvents((currentEvents) =>
					currentEvents.filter((e) => e.id !== event.id),
				);
			}
		}
		for (const event of events) {
			showNotification(event);
		}
		// appBridge.resourcePicker({type: "variant", query: })
	}, [events]);

	return { events, isLoading, error };
}
