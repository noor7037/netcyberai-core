import type { PoolClient } from 'pg';

// The family's own query shape. Kept here so career code does not import the jobs module.
export type Sql = Pick<PoolClient, 'query'>;
