import type { FastifyInstance } from 'fastify';
import type { EngineDeps } from '../server.js';
import { advanceWithMessage } from '../workflow/machine.js';
import { createRun, getRun, getSteps, getTranscript, appendMessages, logStep, saveRun } from '../workflow/runs.js';
import { bookSelectedSlot } from '../workflow/nodes/book.js';
import { storeMedicalFile } from '../tools/files.js';
import { describeImage, describePdf } from '../tools/attachments.js';
import { GREETING } from '../llm/prompts.js';

export function registerConsultRoutes(app: FastifyInstance, deps: EngineDeps): void {
  app.post('/consult/start', async (req) => {
    const run = await createRun(deps.pool, req.user.id);
    await appendMessages(deps.pool, run.id, [{ role: 'assistant', content: GREETING }]);
    return { runId: run.id, node: run.node, status: run.status, reply: GREETING };
  });

  app.get<{ Params: { runId: string } }>('/consult/:runId', async (req, reply) => {
    const run = await getRun(deps.pool, req.params.runId);
    if (!run || run.userId !== req.user.id) return reply.code(404).send({ error: 'run_not_found' });
    const transcript = await getTranscript(deps.pool, run.id);
    return { runId: run.id, node: run.node, status: run.status, reply: '',
      verdict: run.state.verdict, slotOptions: run.state.options, transcript };
  });

  app.post<{ Params: { runId: string }; Body: { text: string } }>(
    '/consult/:runId/message', async (req, reply) => {
      const run = await getRun(deps.pool, req.params.runId);
      if (!run || run.userId !== req.user.id) return reply.code(404).send({ error: 'run_not_found' });
      const text = (req.body?.text ?? '').trim();
      if (!text) return reply.code(400).send({ error: 'empty_message' });
      return advanceWithMessage(deps, run, text);
    });

  app.get<{ Params: { runId: string } }>('/runs/:runId/steps', async (req, reply) => {
    const run = await getRun(deps.pool, req.params.runId);
    if (!run || run.userId !== req.user.id) return reply.code(404).send({ error: 'run_not_found' });
    return { runId: run.id, steps: await getSteps(deps.pool, run.id) };
  });

  app.post<{ Params: { runId: string }; Body: { slotId: string } }>(
    '/consult/:runId/select-slot', async (req, reply) => {
      const run = await getRun(deps.pool, req.params.runId);
      if (!run || run.userId !== req.user.id) return reply.code(404).send({ error: 'run_not_found' });
      const result = await bookSelectedSlot(deps, run, req.body?.slotId ?? '');
      if ('httpError' in result) return reply.code(result.httpError[0]).send({ error: result.httpError[1] });
      return result;
    });

  app.post<{ Params: { runId: string } }>('/consult/:runId/upload', async (req, reply) => {
    const run = await getRun(deps.pool, req.params.runId);
    if (!run || run.userId !== req.user.id) return reply.code(404).send({ error: 'run_not_found' });
    if (run.status === 'escalated') return reply.code(409).send({ error: 'consultation_escalated' });
    if (run.node !== 'intake') return reply.code(409).send({ error: 'uploads_only_during_intake' });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'file_required' });
    const buf = await file.toBuffer();
    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    const isPdf = file.mimetype === 'application/pdf';
    if (!isImage && !isPdf) return reply.code(400).send({ error: 'unsupported_file_type' });

    const path = await storeMedicalFile(deps.supabase, run.userId, run.id, file.filename, buf, file.mimetype);
    // Logged immediately after the store, before the attachment-stage model
    // call below - the audit log's seq order should read store-then-describe,
    // matching what the code actually does.
    await logStep(deps.pool, run.id, 'intake', 'tool_call',
      { tool: isImage ? 'storeImage' : 'extractPdf', filename: file.filename }, { path });
    let turnText: string;
    if (isImage) {
      const base64 = buf.toString('base64');
      const observation = await describeImage(deps, run.id, file.filename, base64);
      run.state.pendingImages.push(base64);
      run.state.attachments.push({ type: 'image', name: file.filename, path, observation });
      turnText = "I've shared a photo of my condition — please review it.";
    } else {
      const { observation, extractedText } = await describePdf(deps, run.id, file.filename, buf);
      run.state.attachments.push({ type: 'pdf', name: file.filename, path, extractedText, observation });
      // A scanned/corrupt PDF has no extractedText. Falling back to the
      // "Contents:\n" phrasing here would end mid-sentence with nothing after
      // the colon and no signal that the document was unreadable, so the
      // intake model could reply as though it had read it. `observation`
      // already carries UNREADABLE_PDF (or NOT_ANALYSED) in that case.
      turnText = extractedText
        ? `I've uploaded a medical document: ${file.filename}. Contents:\n${extractedText}`
        : observation;
    }
    await saveRun(deps.pool, run);
    // 'upload' marks this as an engine-synthesized turn so the case report can
    // exclude it structurally rather than by prefix-matching its text.
    return advanceWithMessage(deps, run, turnText, 'upload');
  });
}
