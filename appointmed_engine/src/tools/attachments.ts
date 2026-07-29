import { OllamaUnavailableError, type ChatMessage } from '../ollama/client.js';
import { attachmentSchema, type AttachmentDecision } from '../llm/schemas.js';
import { attachmentDocPrompt, attachmentImagePrompt } from '../llm/prompts.js';
import { logStep } from '../workflow/runs.js';
import type { EngineDeps } from '../server.js';

/** A PDF with no usable text layer - almost always a scan. Deterministic, no model involved. */
export const UNREADABLE_PDF =
  'Scanned document — no extractable text layer. View the attached original.';

/** The model could not be reached. The file is still stored and still viewable. */
export const NOT_ANALYSED =
  'Not analysed — AI was unavailable when this file was uploaded. View the attached original.';

/**
 * One attachment-stage call. Degrades to NOT_ANALYSED and logs a fallback step
 * rather than failing the upload: an AI outage must never stop a patient
 * attaching their medical records.
 */
async function describe(
  deps: EngineDeps, runId: string, filename: string,
  systemPrompt: string, user: Omit<ChatMessage, 'role'>,
): Promise<string> {
  try {
    const r = await deps.ollama.structured<AttachmentDecision>({
      stage: 'attachment',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', ...user }],
      schema: attachmentSchema,
    });
    await logStep(deps.pool, runId, 'intake', 'llm_decision',
      { for: 'attachment', filename }, r.value, r.model, r.latencyMs);
    return r.value.observation.trim() || NOT_ANALYSED;
  } catch (err) {
    if (!(err instanceof OllamaUnavailableError)) throw err;
    await logStep(deps.pool, runId, 'intake', 'fallback',
      { for: 'attachment', filename }, { observation: NOT_ANALYSED, cause: String(err) });
    return NOT_ANALYSED;
  }
}

/** Vision pass over an uploaded image. The buffer is already in memory - no storage round trip. */
export function describeImage(
  deps: EngineDeps, runId: string, filename: string, base64: string,
): Promise<string> {
  return describe(deps, runId, filename, attachmentImagePrompt,
    { content: `Describe this uploaded medical photograph ("${filename}").`, images: [base64] });
}

/**
 * Text pass over an uploaded PDF.
 *
 * Both a throwing extractor (corrupt or encrypted file) and a blank result
 * (scanned page, no text layer) resolve to UNREADABLE_PDF with NO model call.
 * Before this existed, a throw here escaped as a bare 500 AFTER the file had
 * already been stored.
 */
export async function describePdf(
  deps: EngineDeps, runId: string, filename: string, buf: Buffer,
): Promise<{ observation: string; extractedText: string }> {
  let extractedText: string;
  try {
    extractedText = await deps.extractPdfText(buf);
  } catch (err) {
    await logStep(deps.pool, runId, 'intake', 'fallback',
      { tool: 'extractPdf', filename }, { observation: UNREADABLE_PDF, cause: String(err) });
    return { observation: UNREADABLE_PDF, extractedText: '' };
  }
  if (!extractedText.trim()) {
    await logStep(deps.pool, runId, 'intake', 'fallback',
      { tool: 'extractPdf', filename }, { observation: UNREADABLE_PDF, reason: 'empty_text_layer' });
    return { observation: UNREADABLE_PDF, extractedText: '' };
  }
  const observation = await describe(deps, runId, filename, attachmentDocPrompt,
    { content: `Text extracted from the uploaded document "${filename}":\n${extractedText}` });
  return { observation, extractedText };
}
