/**
 * Contract PDF parser dispatcher.
 *
 * Each PDF is run through the in-file fingerprint of EACH registered
 * template adapter. The first one that matches wins and produces a fully
 * extracted record. If none match, the parser returns templateType: 'unknown'
 * and the dry-run resolver routes the row to the review queue with the
 * extracted-text snippet for manual triage.
 *
 * Adapters are explicit (one file per template). No regex is shared
 * implicitly across templates; each adapter chooses its own label
 * dictionary and date-pairing strategy.
 *
 * Registered adapters (order = priority):
 *   1. NEW_CONTRACT_ADAPTER  — MoHRSD / منصة قوى / العقد الموحد
 *   2. OLD_CONTRACT_ADAPTER  — تجديد عقد العمل / contract renewal
 */
import { extractText, getDocumentProxy } from 'unpdf';
import { NEW_CONTRACT_ADAPTER } from './adapters/contract-new';
import { OLD_CONTRACT_ADAPTER } from './adapters/contract-old';
import { scoreExtraction } from './adapters/contract-old';
import { snippetForReview, normalizeContractText } from './adapters/contract-utils';
import type { ContractExtraction, PdfContractAdapter } from './adapter-types';

const ADAPTERS: PdfContractAdapter[] = [
  // Try the new template first — its fingerprint ("منصة قوى", MoHRSD) is
  // strictly more specific than the old one, so we avoid the case where a
  // new contract happens to also contain the word "تجديد".
  NEW_CONTRACT_ADAPTER,
  OLD_CONTRACT_ADAPTER,
];

export type ParsedContract = ContractExtraction;

async function sha256(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function parsePdfFile(file: File): Promise<ParsedContract> {
  const buf = await file.arrayBuffer();
  const fileHash = await sha256(buf);

  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  const fullText = Array.isArray(text) ? text.join('\n') : text;

  const adapter = ADAPTERS.find((a) => a.fingerprint(fullText));
  if (adapter) {
    return adapter.extract(fullText, file.name, fileHash);
  }

  // No template matched — return a typed "unknown" result so the UI can
  // surface it and the dry-run resolver can route to the review queue.
  const normalized = normalizeContractText(fullText);
  const result = scoreExtraction({
    filename: file.name,
    fileHash,
    templateType: 'unknown',
    rawTextSnippet: snippetForReview(normalized),
  } as Parameters<typeof scoreExtraction>[0]);
  // Make the unknown-template warning explicit.
  return {
    ...result,
    warnings: [
      'Template type could not be determined — neither old nor new contract fingerprints matched.',
      ...result.warnings,
    ],
  };
}
