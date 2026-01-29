// src/lib/types.ts
export type Vec = number[];

export type SubmissionPayload = {
	text?: string;
	fact?: string;
	constraint?: string;
	hope?: string;
	// allow extra keys without falling back to `any`
	[key: string]: unknown;
};

export type SummaryJSON = {
	themes: {
		label: string;
		why?: string;
		members: number[];
		examples?: { participantId: number; text: string }[];
	}[];
	contradictions: { a: number; b: number; explain: string }[];
	outliers: { participantId: number; explain: string }[];
	agenda?: { title: string; rationale: string; refs?: number[] }[];
	tone?: { mood: string; evidence?: number[] };
	stats?: { count: number };
};

export type GraphNode = {
	id: number;
	label?: string;
	text?: string;
	group?: number;
};

export type GraphLink = {
	source: number;
	target: number;
	value?: number;
};

export type GraphData = {
	nodes: GraphNode[];
	links: GraphLink[];
};
