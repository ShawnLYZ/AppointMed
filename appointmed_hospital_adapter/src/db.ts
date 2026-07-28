import pg from 'pg';

export function makePool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 5 });
}
