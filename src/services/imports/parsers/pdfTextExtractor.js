// -*- coding: utf-8 -*-
/**
 * pdfTextExtractor.js
 *
 * Thin wrapper around pdfjs-dist that produces the page-text shape the parsers
 * consume: pages = string[], one entry per PDF page.
 *
 * Mimics pdfplumber's per-page text output, which is what the Python parsers
 * were designed against. The text item layout strategy (sort by y, then x;
 * insert newlines between items more than half a line apart) is what produces
 * the bilingual Arabic+English columns merged on a single line — the same
 * pattern the Python parsers expect.
 */

// Literal-string dynamic imports so Vite's bundler can statically resolve them
// in the browser AND Node's ESM resolver can resolve them via node_modules.
// (A variable + `@vite-ignore` produced a bare specifier the browser couldn't
// resolve at runtime.)

let pdfjsLibPromise = null;

async function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      // Only set workerSrc in a real browser environment. Real browsers expose
      // both `window` and `window.document`; Node test runners that shim
      // `window` for IndexedDB access do NOT have a document, so this guard
      // keeps headless tests working while production behaviour is unchanged.
      const isRealBrowser =
        typeof window !== 'undefined' &&
        typeof window.document !== 'undefined';
      if (lib.GlobalWorkerOptions && isRealBrowser) {
        lib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.mjs',
          import.meta.url
        ).toString();
      }
      return lib;
    })();
  }
  return pdfjsLibPromise;
}

/**
 * Group pdfjs text items into lines using y-coordinate clustering.
 * Sort within a line by x (left → right). pdfjs returns x as the LEFT edge of
 * the glyph; for RTL text in bilingual layouts this still produces the same
 * visual ordering pdfplumber emits.
 */
function groupItemsToLines(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  // Each item has transform = [scaleX, skewY, skewX, scaleY, x, y]
  // We also use item.width (advance width) and item.height (line height) when
  // available — they're populated by pdfjs from the font metrics.
  const enriched = items
    .filter((it) => typeof it.str === 'string' && it.str.length > 0)
    .map((it) => ({
      str:    it.str,
      x:      it.transform ? it.transform[4] : 0,
      y:      it.transform ? it.transform[5] : 0,
      width:  typeof it.width === 'number' ? it.width : 0,
      height: it.height || (it.transform ? Math.abs(it.transform[3]) : 12),
    }));

  // Sort top-to-bottom (pdf coords: larger y = higher up).
  enriched.sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const lines = [];
  let current = null;
  const tolerance = 4;     // px — items within this y range are the same line

  for (const it of enriched) {
    if (!current) {
      current = { y: it.y, items: [it] };
    } else if (Math.abs(current.y - it.y) <= tolerance) {
      current.items.push(it);
      current.y = (current.y * (current.items.length - 1) + it.y) / current.items.length;
    } else {
      lines.push(current);
      current = { y: it.y, items: [it] };
    }
  }
  if (current) lines.push(current);

  return lines.map((line) => {
    line.items.sort((a, b) => a.x - b.x);
    // Build the line string item-by-item using gap analysis. pdfjs emits each
    // glyph as a separate text item — naively joining with a space turns
    // "ﺪﻤﺣأ" into "أ ﺪ ﻤ ﺣ" (every glyph separated). Compare gap between
    // items to font height to decide:
    //   gap < 0.3 × height  → no space (glyphs of the same word)
    //   gap ≥ 0.3 × height  → single space (word boundary)
    // This matches pdfplumber's "char.x1 + cluster_tolerance" logic and is
    // critical for Arabic text where visual-order glyphs need to be merged
    // back into words for the parsers' regexes to match.
    let out = '';
    let prev = null;
    for (const item of line.items) {
      if (!prev) {
        out = item.str;
        prev = item;
        continue;
      }
      const prevEnd = prev.x + (prev.width || 0);
      const gap = item.x - prevEnd;
      const fontH = prev.height || 12;
      // If item.str already starts/ends with whitespace, don't double-space.
      const prevHasTrailingSpace = /\s$/.test(out);
      const itemHasLeadingSpace  = /^\s/.test(item.str);
      const needSpace = gap >= fontH * 0.3 && !prevHasTrailingSpace && !itemHasLeadingSpace;
      out += (needSpace ? ' ' : '') + item.str;
      prev = item;
    }
    return out.replace(/\s+/g, ' ').trim();
  });
}

/**
 * extractPagesText(input) → { pages: string[], pageCount }
 * Accepts: File, Blob, ArrayBuffer, Uint8Array, or { data: ArrayBuffer/Uint8Array }
 */
export async function extractPagesText(input) {
  const lib = await loadPdfjs();

  let data;
  if (input instanceof ArrayBuffer)         data = new Uint8Array(input);
  else if (input instanceof Uint8Array)     data = input;
  else if (input?.data)                     data = input.data instanceof ArrayBuffer
                                                 ? new Uint8Array(input.data)
                                                 : input.data;
  else if (typeof input?.arrayBuffer === 'function') {
    data = new Uint8Array(await input.arrayBuffer());
  } else {
    throw new Error('extractPagesText: unsupported input type');
  }

  const task = lib.getDocument({ data });
  const doc  = await task.promise;
  const pages = [];

  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const lines = groupItemsToLines(content.items);
    pages.push(lines.join('\n'));
  }

  await doc.cleanup?.();
  await doc.destroy?.();

  return { pages, pageCount: doc.numPages };
}
