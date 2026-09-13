import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const projects = sqliteTable('projects', {
  deletedAt: text('deleted_at'),purgeToken:text('purge_token'),purgeLeaseUntil:text('purge_lease_until'),
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), document: text('document').notNull(),
  version: integer('version').notNull(), mutationId: text('mutation_id').notNull(), updatedAt: text('updated_at').notNull(),
}, t => [index('idx_projects_owner_updated').on(t.ownerId, t.updatedAt)]);
export const releases = sqliteTable('releases', {
  id:text('id').primaryKey(), projectId:text('project_id').notNull().references(()=>projects.id),
  ownerId:text('owner_id').notNull(), metadata:text('metadata').notNull(), records:text('records').notNull(), createdAt:text('created_at').notNull(),
}, t=>[index('idx_releases_owner_project').on(t.ownerId,t.projectId)]);
export const audit = sqliteTable('audit', {
  evidenceJson:text('evidence_json').notNull().default('{}'),projectVersion:integer('project_version').notNull().default(0),requestId:text('request_id'),
  id:text('id').primaryKey(), projectId:text('project_id').notNull().references(()=>projects.id),
  ownerId:text('owner_id').notNull(), actor:text('actor').notNull(), action:text('action').notNull(), detail:text('detail').notNull(), createdAt:text('created_at').notNull(),
}, t=>[index('idx_audit_owner_created').on(t.ownerId,t.createdAt), index('idx_audit_project').on(t.projectId)]);

export const workspaces = sqliteTable('workspaces', {
  id:text('id').primaryKey(), name:text('name').notNull(), ownerEmail:text('owner_email').notNull(),
  requireApproval:integer('require_approval').notNull().default(0), retentionDays:integer('retention_days').notNull().default(30),
  createdAt:text('created_at').notNull(),
});
export const members = sqliteTable('members', {
  id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),userId:text('user_id').notNull(),
  email:text('email').notNull(),role:text('role').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('idx_members_user').on(t.userId),index('idx_members_workspace').on(t.workspaceId)]);
export const invitations = sqliteTable('invitations', {
  id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),email:text('email').notNull(),role:text('role').notNull(),
  tokenHash:text('token_hash').notNull(),expiresAt:text('expires_at').notNull(),claimedBy:text('claimed_by'),revokedAt:text('revoked_at'),createdAt:text('created_at').notNull(),
},t=>[index('idx_invitations_workspace').on(t.workspaceId)]);
export const workspaceEvents = sqliteTable('workspace_events', {
  id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),actor:text('actor').notNull(),action:text('action').notNull(),evidence:text('evidence').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('idx_workspace_events_created').on(t.workspaceId,t.createdAt)]);
export const requests = sqliteTable('requests', {
  id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),route:text('route').notNull(),method:text('method').notNull(),status:integer('status').notNull(),durationMs:integer('duration_ms').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('idx_requests_workspace_created').on(t.workspaceId,t.createdAt)]);
export const destinations = sqliteTable('destinations', {
  workspaceId:text('workspace_id').primaryKey(),baseUrl:text('base_url').notNull(),encryptedToken:text('encrypted_token').notNull(),updatedAt:text('updated_at').notNull(),
});
export const deliveries = sqliteTable('deliveries', {
  id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),projectId:text('project_id').notNull(),releaseId:text('release_id').notNull(),
  status:text('status').notNull(),attempts:integer('attempts').notNull().default(0),nextAttemptAt:text('next_attempt_at').notNull(),leaseToken:text('lease_token'),leaseUntil:text('lease_until'),receipt:text('receipt'),lastError:text('last_error'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('idx_deliveries_workspace').on(t.workspaceId,t.updatedAt)]);
export const backups = sqliteTable('backups', {
  id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),projectId:text('project_id').notNull(),projectName:text('project_name').notNull(),
  manifestKey:text('manifest_key').notNull(),manifestHash:text('manifest_hash').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),
},t=>[index('idx_backups_workspace').on(t.workspaceId,t.createdAt)]);
