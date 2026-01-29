import { matchAction } from "$lib/server/actions/match";
import { requireAdminForApi } from "$lib/server/admin";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	requireAdminForApi(request);
	return matchAction();
};
