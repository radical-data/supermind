// src/lib/server/db/schema.ts
import { sql } from 'drizzle-orm';
import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';

// Helpers
const nowText = sql`CURRENT_TIMESTAMP`;

// ────────────────────────────────────────────────────────────────────────────────
// Participants
// ────────────────────────────────────────────────────────────────────────────────
export const participants = sqliteTable('participants', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	// store table side; typed in TS as 'A' | 'B'
	tableSide: text('table_side').$type<'A' | 'B'>().notNull(),
	createdAt: text('created_at').default(nowText).notNull()
});

// ────────────────────────────────────────────────────────────────────────────────
// Runs (a session of the exercise)
// ────────────────────────────────────────────────────────────────────────────────
export const runs = sqliteTable('runs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	createdAt: text('created_at').default(nowText).notNull(),
	clustersJson: text('clusters_json'), // LLM clustering output (stringified JSON)
	optionsJson: text('options_json'), // LLM options A/B (stringified JSON)
	pairsJson: text('pairs_json') // LLM pairing output (stringified JSON)
});

// ────────────────────────────────────────────────────────────────────────────────
// Submissions (type-agnostic; payload JSON holds fields like fact/constraint/hope)
// ────────────────────────────────────────────────────────────────────────────────
export const submissions = sqliteTable('submissions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	runId: integer('run_id')
		.notNull()
		.references(() => runs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	participantId: integer('participant_id')
		.notNull()
		.references(() => participants.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	kind: text('kind').default('line').notNull(),
	payloadJson: text('payload_json').notNull(),
	createdAt: text('created_at').default(nowText).notNull()
});

// ────────────────────────────────────────────────────────────────────────────────
// Normalised (LLM-normalised record per submission)
// ────────────────────────────────────────────────────────────────────────────────
export const normalised = sqliteTable('normalised', {
	submissionId: integer('submission_id')
		.primaryKey()
		.references(() => submissions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	dataJson: text('data_json').notNull(),
	embeddingJson: text('embedding_json')
});

// ────────────────────────────────────────────────────────────────────────────────
// Votes (A↔B slider), per run, with per-table context captured
// ────────────────────────────────────────────────────────────────────────────────
export const votes = sqliteTable(
	'votes',
	{
		participantId: integer('participant_id')
			.notNull()
			.references(() => participants.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		runId: integer('run_id')
			.notNull()
			.references(() => runs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		// 0 = strong A, 100 = strong B
		value: integer('value').notNull(),
		// snapshot of the participant’s table side at vote time
		tableSide: text('table_side').$type<'A' | 'B'>().notNull(),
		createdAt: text('created_at').default(nowText).notNull()
	},
	(t) => ({
		pk: primaryKey({ columns: [t.runId, t.participantId] })
	})
);

// Optional constraint to keep value within 0..100
export const votes_value_check = sql`
  CREATE TABLE IF NOT EXISTS __votes_value_check (x INT);
  -- no-op container; drizzle sqlite lacks table-level CHECK builder
`;
