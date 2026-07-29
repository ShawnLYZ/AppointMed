import type { Pool } from 'pg';
import { emptyState, type Node, type Run, type RunState, type RunStatus } from './types.js';

export async function createRun(pool: Pool, userId: string): Promise<Run> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `insert into public.workflow_runs (user_id, status, current_node, state)
       values ($1, 'active', 'intake', $2) returning id`,
      [userId, JSON.stringify(emptyState())],
    );
    await client.query(
      `insert into public.ai_chats (user_id, run_id, messages) values ($1, $2, '[]'::jsonb)`,
      [userId, rows[0].id],
    );
    await client.query('commit');
    return { id: rows[0].id, userId, status: 'active', node: 'intake', state: emptyState() };
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function getRun(pool: Pool, runId: string): Promise<Run | null> {
  const { rows } = await pool.query(
    'select id, user_id, status, current_node, state from public.workflow_runs where id = $1', [runId]);
  if (rows.length === 0) return null;
  return { id: rows[0].id, userId: rows[0].user_id, status: rows[0].status as RunStatus,
    node: rows[0].current_node as Node, state: rows[0].state as RunState };
}

export async function saveRun(pool: Pool, run: Run): Promise<void> {
  await pool.query(
    'update public.workflow_runs set status = $2, current_node = $3, state = $4 where id = $1',
    [run.id, run.status, run.node, JSON.stringify(run.state)]);
}

export async function logStep(
  pool: Pool, runId: string, node: string,
  kind: 'llm_decision' | 'tool_call' | 'transition' | 'error' | 'fallback',
  input: unknown, output: unknown, model?: string, latencyMs?: number,
): Promise<void> {
  await pool.query(
    `insert into public.workflow_steps (run_id, seq, node, kind, input, output, model, latency_ms)
     select $1, coalesce(max(seq), 0) + 1, $2, $3, $4, $5, $6, $7
       from public.workflow_steps where run_id = $1`,
    [runId, node, kind, JSON.stringify(input ?? null), JSON.stringify(output ?? null), model ?? null, latencyMs ?? null]);
}

/**
 * One stored chat turn. `kind: 'upload'` marks a turn the ENGINE synthesized
 * for a file upload rather than one the patient typed. ai_chats.messages is
 * jsonb and appendMessages already spreads arbitrary extra fields, so this is
 * additive - rows written before this shipped simply lack the key, and both
 * clients ignore it.
 */
export interface TranscriptEntry {
  role: 'user' | 'assistant';
  content: string;
  kind?: 'upload';
}

export async function appendMessages(
  pool: Pool, runId: string, msgs: TranscriptEntry[],
): Promise<void> {
  const stamped = msgs.map((m) => ({ ...m, at: new Date().toISOString() }));
  await pool.query(
    'update public.ai_chats set messages = messages || $2::jsonb where run_id = $1',
    [runId, JSON.stringify(stamped)]);
}

export async function getTranscript(pool: Pool, runId: string): Promise<TranscriptEntry[]> {
  const { rows } = await pool.query('select messages from public.ai_chats where run_id = $1', [runId]);
  return (rows[0]?.messages ?? []) as TranscriptEntry[];
}

export async function getSteps(pool: Pool, runId: string) {
  const { rows } = await pool.query(
    `select seq, node, kind, input, output, model, latency_ms, created_at
       from public.workflow_steps where run_id = $1 order by seq`, [runId]);
  return rows;
}
