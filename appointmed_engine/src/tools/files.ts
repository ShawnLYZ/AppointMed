import pdfParse from 'pdf-parse';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function extractPdfText(buf: Buffer): Promise<string> {
  const { text } = await pdfParse(buf);
  return text.slice(0, 4000);
}

export async function storeMedicalFile(
  supabase: SupabaseClient, userId: string, runId: string,
  filename: string, buf: Buffer, contentType: string,
): Promise<string> {
  const path = `${userId}/${runId}/${Date.now()}-${filename}`;
  const { error } = await supabase.storage.from('medical-files')
    .upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return path;
}
