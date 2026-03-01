function stripTags(value: string): string {
    return value
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, '\'')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function splitChecklistItem(text: string): { title: string; description: string } {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return {
            title: 'Complete this step',
            description: 'Mark this item when you have finished the action.',
        };
    }

    const separator = normalized.match(/^(.{3,80}?)(?:\s[:\-]\s|\s[—–]\s)(.{10,})$/);
    if (separator) {
        return {
            title: separator[1].trim(),
            description: separator[2].trim(),
        };
    }

    if (normalized.length <= 84) {
        return {
            title: normalized,
            description: 'Mark this once you have completed the step.',
        };
    }

    const sentenceSplit = normalized.match(/^(.{20,84}?[.!?])\s+(.+)$/);
    if (sentenceSplit) {
        return {
            title: sentenceSplit[1].trim(),
            description: sentenceSplit[2].trim(),
        };
    }

    return {
        title: normalized.slice(0, 84).trim(),
        description: normalized.slice(84).trim() || 'Mark this once you have completed the step.',
    };
}

function extractParagraphHtml(sectionHtml: string): { introHtml: string; outroHtml: string } {
    const paragraphs = [...sectionHtml.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].map((match) => match[0]);
    if (paragraphs.length === 0) {
        return { introHtml: '', outroHtml: '' };
    }

    if (paragraphs.length === 1) {
        return { introHtml: paragraphs[0], outroHtml: '' };
    }

    return {
        introHtml: paragraphs.slice(0, 2).join('\n'),
        outroHtml: paragraphs.length > 2 ? paragraphs[paragraphs.length - 1] : '',
    };
}

function extractListItemTexts(sectionHtml: string): string[] {
    const items = [...sectionHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((match) => stripTags(match[1] || ''))
        .filter(Boolean);

    if (items.length > 0) {
        return items.slice(0, 6);
    }

    const fallbackSentences = stripTags(sectionHtml)
        .split(/(?<=[.!?])\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 24);

    return fallbackSentences.slice(0, 5);
}

function hasInteractiveChecklistControls(sectionHtml: string): boolean {
    return /type=["']checkbox["']|peer-checked:|data-checklist-section=["']true["']|aria-pressed=|x-model=|@click=|x-data=/i.test(sectionHtml);
}

function rebuildChecklistSection(sectionHtml: string): string {
    if (hasInteractiveChecklistControls(sectionHtml)) {
        return sectionHtml;
    }

    const sourceComment = sectionHtml.match(/^\s*(<!--\s*sources:\s*[\s\S]*?-->)/i)?.[1] || '';
    const sectionId = sectionHtml.match(/<section[^>]*\bid=["']([^"']+)["']/i)?.[1]?.trim();
    if (!sectionId) {
        return sectionHtml;
    }

    const title = stripTags(sectionHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] || sectionId) || sectionId;
    const { introHtml, outroHtml } = extractParagraphHtml(sectionHtml);
    const itemTexts = extractListItemTexts(sectionHtml);
    if (itemTexts.length === 0) {
        return sectionHtml;
    }

    const checklistItems = itemTexts.map((itemText, index) => {
        const itemId = `${sectionId}-item-${index + 1}`;
        const item = splitChecklistItem(itemText);
        return `
          <label for="${itemId}" class="group flex cursor-pointer items-start gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
            <input id="${itemId}" type="checkbox" class="peer sr-only" />
            <span class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-transparent transition peer-checked:border-slate-900 peer-checked:bg-slate-900 peer-checked:text-white">
              <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.262a1 1 0 0 1-1.42 0L3.29 9.165a1 1 0 1 1 1.414-1.414l4.096 4.097 6.493-6.552a1 1 0 0 1 1.411-.006Z" clip-rule="evenodd"></path>
              </svg>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-base font-semibold text-slate-900 transition peer-checked:text-slate-500 peer-checked:line-through">${escapeHtml(item.title)}</span>
              <span class="mt-1 block text-sm leading-6 text-slate-600 transition peer-checked:text-slate-400">${escapeHtml(item.description)}</span>
            </span>
          </label>`.trim();
    }).join('\n');

    const introBlock = introHtml
        ? `<div class="mt-4 space-y-3 text-sm leading-7 text-slate-600">${introHtml}</div>`
        : `<p class="mt-4 text-sm leading-7 text-slate-600">Move through each item deliberately and check it off as you complete it.</p>`;
    const outroBlock = outroHtml
        ? `<div class="mt-5 rounded-2xl border border-[color:color-mix(in_srgb,var(--creator-primary)_18%,white)] bg-[color:color-mix(in_srgb,var(--creator-primary)_10%,white)] px-4 py-4 text-sm leading-7 text-slate-700">${outroHtml}</div>`
        : '';

    const rebuiltSection = `
<section id="${sectionId}" data-checklist-section="true" class="rounded-[28px] border border-slate-200 bg-white/92 px-5 py-6 shadow-soft sm:px-6">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Checklist category</p>
      <h2 class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(title)}</h2>
    </div>
    <div class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">Tap to mark complete</div>
  </div>
  ${introBlock}
  <div class="mt-5 space-y-3">
    ${checklistItems}
  </div>
  ${outroBlock}
</section>`.trim();

    return [sourceComment, rebuiltSection].filter(Boolean).join('\n');
}

export function ensureChecklistDocumentInteractivity(html: string): string {
    return html.replace(/((?:<!--\s*sources:\s*[\s\S]*?-->\s*)?<section\b[^>]*\bid=["']category-\d+["'][\s\S]*?<\/section>)/gi, (match) => {
        try {
            return rebuildChecklistSection(match);
        } catch {
            return match;
        }
    });
}
