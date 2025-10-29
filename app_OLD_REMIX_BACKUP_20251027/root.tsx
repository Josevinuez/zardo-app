import { json, LoaderFunctionArgs } from "@remix-run/node";
import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "@remix-run/react";

export async function loader() {
	return json({
		env: {
			SUPABASE_URL: process.env.SUPABASE_URL,
			SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
		},
	});
}

export default function App() {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<link rel="preconnect" href="https://cdn.shopify.com/" />
				<link
					rel="stylesheet"
					href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
				/>
				<Meta />
				<Links />
			</head>
			<body>
				<Outlet />
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}
