import type { Handle } from "@sveltejs/kit";
import { adminBasicResponseIfUnauthorised } from "$lib/server/admin";

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith("/control")) {
		const unauth = adminBasicResponseIfUnauthorised(event.request);
		if (unauth) return unauth;
	}

	return resolve(event);
};
