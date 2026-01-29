import { summariseAction } from "$lib/server/actions/summary";
import { requireAdminForApi } from "$lib/server/admin";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	requireAdminForApi(request);
	return summariseAction();
};
