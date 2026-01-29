import { json } from "@sveltejs/kit";
import { getCurrentRunId } from "$lib/server";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () =>
	json({ runId: await getCurrentRunId() });
