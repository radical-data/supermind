// src/lib/server/db/schema.ts
import { sql } from 'drizzle-orm';
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

// Helpers
const nowText = sql`CURRENT_TIMESTAMP`;

// ────────────────────────────────────────────────────────────────────────────────
// Participants
// ────────────────────────────────────────────────────────────────────────────────
export const participants = sqliteTable('participants', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
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
