import type { RequestHandler } from './$types';
import { resetRunAction } from '$lib/server/actions/reset';
import { requireAdminForApi } from '$lib/server/admin';

export const POST: RequestHandler = async ({ request }) => {
	requireAdminForApi(request);
	return resetRunAction();
};

