import type { EngineDeps } from '../server.js';
import type { ConsultReply, Run } from './types.js';
import { handleIntakeMessage } from './nodes/intake.js';
import { handleMatchMessage } from './nodes/match.js';

export async function advanceWithMessage(
  deps: EngineDeps, run: Run, text: string, kind?: 'upload',
): Promise<ConsultReply> {
  // An escalated run is sealed: any further message returns fixed emergency
  // guidance deterministically — never the LLM intake flow (node still points there).
  if (run.status === 'escalated') {
    return { runId: run.id, node: run.node, status: run.status,
      reply: 'Please seek emergency care as advised — call 999 or go to the nearest emergency department. This consultation is closed for your safety; you can start a new one any time.' };
  }
  switch (run.node) {
    case 'intake': return handleIntakeMessage(deps, run, text, kind);
    case 'match': return handleMatchMessage(deps, run, text);
    case 'hospital_review':
      return { runId: run.id, node: run.node, status: run.status,
        reply: 'Your booking request is with the hospital team — I will notify you the moment they respond.' };
    default:
      return { runId: run.id, node: run.node, status: run.status,
        reply: 'This consultation is complete. Start a new one from the chat tab any time.' };
  }
}
