import type { RequestHandler } from './$types';
import { matchAction } from '$lib/server/actions/match';
import { requireAdminForApi } from '$lib/server/admin';

export const POST: RequestHandler = async ({ request }) => {
	requireAdminForApi(request);
	return matchAction();
};

