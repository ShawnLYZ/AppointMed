import type { Pool } from 'pg';
export async function insertNotification(
  pool: Pool, userId: string, type: string, title: string, body: string, data: object = {},
): Promise<void> {
  await pool.query(
    `insert into public.notifications (user_id, type, title, body, data) values ($1, $2, $3, $4, $5)`,
    [userId, type, title, body, JSON.stringify(data)]);
}
