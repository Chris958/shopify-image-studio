import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const documents = sqliteTable('documents', {
id: text('id').primaryKey(), owner: text('owner').notNull(), kind: text('kind').notNull(),
project: text('project').notNull(), data: text('data').notNull(),
revision: integer('revision').notNull().default(1), updated: text('updated').notNull(),
}, t => [index('owner_project_idx').on(t.owner,t.project)]);
