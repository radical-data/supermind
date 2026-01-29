import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import { timingSafeEqual } from 'crypto';

const REALM = 'Supermind Control';

let warnedMissingToken = false;

function getAdminToken(): string | null {
	const token = env.ADMIN_TOKEN;
	if (!token) {
		if (!warnedMissingToken && process.env.NODE_ENV !== 'test') {
			console.error(
				'[admin] ADMIN_TOKEN is not set; all admin-protected routes will fail closed.'
			);
			warnedMissingToken = true;
		}
		return null;
	}
	return String(token);
}

function safeCompare(a: string, b: string): boolean {
	const aBuf = Buffer.from(a);
	const bBuf = Buffer.from(b);
	if (aBuf.length !== bBuf.length) return false;
	return timingSafeEqual(aBuf, bBuf);
}

type AuthKind = 'basic' | 'bearer' | 'any';

function parseAuthHeader(request: Request): { scheme: string; value: string } | null {
	const header = request.headers.get('authorization') || request.headers.get('Authorization');
	if (!header) return null;
	const firstSpace = header.indexOf(' ');
	if (firstSpace <= 0) return null;
	const scheme = header.slice(0, firstSpace).toLowerCase();
	const value = header.slice(firstSpace + 1).trim();
	if (!scheme || !value) return null;
	return { scheme, value };
}

function validateBasic(headerValue: string, expectedToken: string): boolean {
	let decoded: string;
	try {
		decoded = Buffer.from(headerValue, 'base64').toString('utf8');
	} catch {
		return false;
	}
	const idx = decoded.indexOf(':');
	if (idx === -1) return false;
	const username = decoded.slice(0, idx);
	const password = decoded.slice(idx + 1);
	if (username !== 'admin') return false;
	return safeCompare(password, expectedToken);
}

function validateBearer(token: string, expectedToken: string): boolean {
	return safeCompare(token, expectedToken);
}

function isAdmin(request: Request, kind: AuthKind): boolean {
	const adminToken = getAdminToken();
	if (!adminToken) return false;
	const parsed = parseAuthHeader(request);
	if (!parsed) return false;

	if (kind === 'basic' || kind === 'any') {
		if (parsed.scheme === 'basic' && validateBasic(parsed.value, adminToken)) return true;
	}

	if (kind === 'bearer' || kind === 'any') {
		if (parsed.scheme === 'bearer' && validateBearer(parsed.value, adminToken)) return true;
	}

	return false;
}

/** Return a 401 Basic challenge response if not authorised. */
export function adminBasicResponseIfUnauthorised(request: Request): Response | null {
	if (isAdmin(request, 'basic')) return null;
	return new Response('Unauthorised', {
		status: 401,
		headers: {
			'WWW-Authenticate': `Basic realm="${REALM}"`,
			'Cache-Control': 'no-store',
			Vary: 'Authorization'
		}
	});
}

/** Require admin auth for API requests; throws 401 if unauthorised. */
export function requireAdminForApi(request: Request): void {
	if (isAdmin(request, 'any')) return;
	throw error(401, 'unauthorised');
}

export function jsonNoStore<T>(data: T, init?: ResponseInit) {
	const baseHeaders = {
		'Cache-Control': 'no-store',
		Vary: 'Authorization'
	};
	const headers = init?.headers
		? { ...baseHeaders, ...(init.headers as Record<string, string>) }
		: baseHeaders;
	return json(data, { ...init, headers });
}

