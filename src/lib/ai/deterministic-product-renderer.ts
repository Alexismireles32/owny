import type { ProductType } from '@/types/build-packet';
import type { CreativeDirection } from '@/lib/ai/design-canon';
import type { CreatorDNA } from '@/lib/ai/creator-dna';

interface BlueprintSection {
    id: string;
    title: string;
    body: string;
    sourceVideoIds: string[];
}

interface TextBlueprint {
    title: string;
    subtitle: string;
    sections: BlueprintSection[];
    keyTakeaways: string[];
    faq: Array<{ question: string; answer: string }>;
}

interface SelectedContext {
    videoId: string;
    title: string;
    transcriptContext: string;
}

export function renderProductFromBlueprint(input: {
    productType: ProductType;
    productTitle: string;
    creatorHandle: string;
    creatorDisplayName: string;
    creatorDna: CreatorDNA;
    creativeDirection: CreativeDirection;
    blueprint: TextBlueprint;
    selectedContexts: SelectedContext[];
}): string {
    const palette = {
        primary: input.creatorDna.visual.primaryColor || '#0f766e',
        secondary: input.creatorDna.visual.secondaryColor || '#155e75',
        background: input.creatorDna.visual.backgroundColor || '#f8fafc',
        text: input.creatorDna.visual.textColor || '#0f172a',
    };

    const sections = input.blueprint.sections.length > 0
        ? input.blueprint.sections
        : input.selectedContexts.slice(0, 6).map((context, index) => ({
            id: `section-${index + 1}`,
            title: context.title || `Section ${index + 1}`,
            body: context.transcriptContext.slice(0, 1400),
            sourceVideoIds: [context.videoId],
        }));

    const rendererInput = {
        ...input,
        palette,
        sections,
    };

    const content = (() => {
        switch (input.productType) {
            case 'mini_course':
                return renderMiniCourse(rendererInput);
            case 'challenge_7day':
                return renderChallenge(rendererInput);
            case 'checklist_toolkit':
                return renderChecklistToolkit(rendererInput);
            case 'pdf_guide':
            default:
                return renderPdfGuide(rendererInput);
        }
    })();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.productTitle)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brandPrimary: '${escapeHtml(palette.primary)}',
            brandSecondary: '${escapeHtml(palette.secondary)}',
            brandSurface: '${escapeHtml(palette.background)}',
            brandInk: '${escapeHtml(palette.text)}'
          },
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif']
          }
        }
      }
    }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <style>
    :root {
      --brand-primary: ${escapeHtml(palette.primary)};
      --brand-secondary: ${escapeHtml(palette.secondary)};
      --brand-surface: ${escapeHtml(palette.background)};
      --brand-ink: ${escapeHtml(palette.text)};
    }
    body {
      background:
        radial-gradient(circle at top, color-mix(in srgb, var(--brand-primary) 10%, white) 0%, rgba(255,255,255,0) 42%),
        linear-gradient(180deg, #ffffff 0%, var(--brand-surface) 100%);
      color: var(--brand-ink);
    }
    .bg-card { background-color: rgba(255,255,255,0.88); }
    .text-muted-foreground { color: #475569; }
    .section-copy p + p { margin-top: 1rem; }
  </style>
</head>
<body class="min-h-screen font-sans text-slate-900 antialiased">
  <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    ${content}
  </main>
</body>
</html>`;
}

function renderPdfGuide(input: RenderInput): string {
    const toc = input.sections.map((section, index) => `
      <a href="#chapter-${index + 1}" class="flex items-center justify-between rounded-xl border border-slate-200 bg-card px-4 py-3 shadow-sm transition hover:border-slate-300">
        <span class="font-medium text-slate-900">${escapeHtml(section.title)}</span>
        <span class="text-sm text-muted-foreground">Chapter ${index + 1}</span>
      </a>
    `).join('');

    const chapters = input.sections.map((section, index) => `
      <!-- sources: ${section.sourceVideoIds.join(',')} -->
      <section id="chapter-${index + 1}" class="rounded-[28px] border border-slate-200 bg-card p-6 shadow-sm sm:p-8">
        <div class="mb-5 flex items-center gap-3">
          <span class="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm">${index + 1}</span>
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Chapter ${index + 1}</p>
            <h2 class="text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(section.title)}</h2>
          </div>
        </div>
        <div class="section-copy text-base leading-8 text-slate-700">
          ${renderParagraphs(mergeEvidence(section, input.selectedContexts))}
        </div>
        ${renderTakeawayBox(section)}
        <div class="mt-6 flex justify-end">
          <a href="#toc" class="text-sm font-medium text-slate-600 transition hover:text-slate-900">Back to top ↑</a>
        </div>
      </section>
    `).join('');

    return `
      <section class="mb-8 rounded-[32px] border border-slate-200 bg-card p-8 shadow-sm sm:p-10">
        <div class="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 shadow-sm">Premium guide</div>
        <div class="mt-6 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h1 class="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">${escapeHtml(input.blueprint.title || input.productTitle)}</h1>
            <p class="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">${escapeHtml(input.blueprint.subtitle || `${input.creativeDirection.narrativeAngle} built from ${input.creatorDisplayName}'s real content.`)}</p>
          </div>
          <div class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Creator</p>
            <p class="mt-2 text-xl font-semibold text-slate-950">${escapeHtml(input.creatorDisplayName)}</p>
            <p class="text-sm text-muted-foreground">@${escapeHtml(input.creatorHandle)}</p>
            <p class="mt-5 text-sm leading-7 text-slate-600">${escapeHtml(input.creativeDirection.signatureMoves.join(' • '))}</p>
          </div>
        </div>
      </section>
      <section id="toc" class="mb-8 rounded-[28px] border border-slate-200 bg-card p-6 shadow-sm">
        <div class="mb-5 flex items-center justify-between">
          <h2 class="text-xl font-semibold text-slate-950">Table of contents</h2>
          <span class="text-sm text-muted-foreground">${input.sections.length} chapters</span>
        </div>
        <div class="grid gap-3">${toc}</div>
      </section>
      <div class="space-y-6">${chapters}</div>
      ${renderSummarySection(input)}
      ${renderFaqSection(input)}
    `;
}

function renderMiniCourse(input: RenderInput): string {
    const modules = input.sections.map((section, index) => `
      <!-- sources: ${section.sourceVideoIds.join(',')} -->
      <section id="module-${index + 1}" x-show="activeModule === ${index + 1}" x-cloak class="rounded-[28px] border border-slate-200 bg-card p-6 shadow-sm sm:p-8">
        <div class="flex flex-wrap items-center gap-3">
          <span class="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 shadow-sm">Module ${index + 1}</span>
          <h2 class="text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(section.title)}</h2>
        </div>
        <div class="section-copy mt-6 text-base leading-8 text-slate-700">
          ${renderParagraphs(mergeEvidence(section, input.selectedContexts))}
        </div>
        ${renderActionList(section, 'Action lab')}
        <div class="mt-8 flex items-center justify-between">
          <button class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" ${index === 0 ? 'disabled' : `@click="activeModule = ${index}"`}>← Previous</button>
          <button class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" ${index === input.sections.length - 1 ? 'disabled' : `@click="activeModule = ${index + 2}"`}>Next →</button>
        </div>
      </section>
    `).join('');

    const nav = input.sections.map((section, index) => `
      <button @click="activeModule = ${index + 1}" :class="activeModule === ${index + 1} ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700'" class="flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left shadow-sm transition">
        <span class="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-current text-xs font-semibold">${index + 1}</span>
        <span>
          <span class="block text-sm font-semibold">${escapeHtml(section.title)}</span>
          <span class="mt-1 block text-xs opacity-75">${escapeHtml(trimWords(section.body, 18))}</span>
        </span>
      </button>
    `).join('');

    return `
      <section class="mb-8 rounded-[32px] border border-slate-200 bg-card p-8 shadow-sm sm:p-10">
        <div class="max-w-3xl">
          <div class="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 shadow-sm">Mini course</div>
          <h1 class="mt-5 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">${escapeHtml(input.blueprint.title || input.productTitle)}</h1>
          <p class="mt-4 text-lg leading-8 text-muted-foreground">${escapeHtml(input.blueprint.subtitle || input.creativeDirection.narrativeAngle)}</p>
        </div>
      </section>
      <section x-data="{ activeModule: 1 }" class="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside class="rounded-[28px] border border-slate-200 bg-card p-4 shadow-sm">${nav}</aside>
        <div class="space-y-6">${modules}</div>
      </section>
      ${renderSummarySection(input)}
      ${renderFaqSection(input)}
    `;
}

function renderChallenge(input: RenderInput): string {
    const days = buildChallengeDays(input.sections, input.selectedContexts);
    const tabs = days.map((day, index) => `
      <button @click="activeDay = ${index + 1}" :class="activeDay === ${index + 1} ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700'" class="rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition">Day ${index + 1}</button>
    `).join('');

    const content = days.map((day, index) => `
      <!-- sources: ${day.sourceVideoIds.join(',')} -->
      <section id="day-${index + 1}" x-show="activeDay === ${index + 1}" x-cloak class="rounded-[28px] border border-slate-200 bg-card p-6 shadow-sm sm:p-8">
        <div class="flex items-center gap-4">
          <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-950 text-lg font-semibold text-white shadow-sm">${index + 1}</div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Day ${index + 1}</p>
            <h2 class="text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(day.title)}</h2>
          </div>
        </div>
        <div class="section-copy mt-6 text-base leading-8 text-slate-700">
          ${renderParagraphs(day.body)}
        </div>
        ${renderActionList(day, 'Today\'s tasks')}
        <div class="mt-8 flex items-center justify-between">
          <button class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" ${index === 0 ? 'disabled' : `@click="activeDay = ${index}"`}>← Previous</button>
          <button class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" ${index === days.length - 1 ? 'disabled' : `@click="activeDay = ${index + 2}"`}>Next →</button>
        </div>
      </section>
    `).join('');

    return `
      <section class="mb-8 rounded-[32px] border border-slate-200 bg-card p-8 shadow-sm sm:p-10">
        <div class="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 shadow-sm">7-day challenge</div>
        <h1 class="mt-5 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">${escapeHtml(input.blueprint.title || input.productTitle)}</h1>
        <p class="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">${escapeHtml(input.blueprint.subtitle || input.creativeDirection.narrativeAngle)}</p>
      </section>
      <section x-data="{ activeDay: 1 }" class="space-y-6">
        <div class="flex flex-wrap gap-3">${tabs}</div>
        ${content}
      </section>
      ${renderSummarySection(input)}
    `;
}

function renderChecklistToolkit(input: RenderInput): string {
    const categories = input.sections.map((section, index) => {
        const items = deriveChecklistItems(section, input.selectedContexts);
        const itemMarkup = items.map((item, itemIndex) => `
          <div class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span class="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-600">${itemIndex + 1}</span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-slate-900">${escapeHtml(item)}</p>
            </div>
          </div>
        `).join('');

        return `
          <!-- sources: ${section.sourceVideoIds.join(',')} -->
          <section id="category-${index + 1}" class="rounded-[28px] border border-slate-200 bg-card p-6 shadow-sm sm:p-8">
            <div class="mb-6 flex items-center justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Category ${index + 1}</p>
                <h2 class="text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(section.title)}</h2>
              </div>
              <span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm">${items.length} items</span>
            </div>
            <div class="section-copy mb-6 text-base leading-8 text-slate-700">${renderParagraphs(mergeEvidence(section, input.selectedContexts))}</div>
            <div class="grid gap-3">${itemMarkup}</div>
          </section>
        `;
    }).join('');

    return `
      <section class="mb-8 rounded-[32px] border border-slate-200 bg-card p-8 shadow-sm sm:p-10">
        <div class="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 shadow-sm">Checklist toolkit</div>
        <div class="mt-5 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h1 class="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">${escapeHtml(input.blueprint.title || input.productTitle)}</h1>
            <p class="mt-4 text-lg leading-8 text-muted-foreground">${escapeHtml(input.blueprint.subtitle || input.creativeDirection.narrativeAngle)}</p>
          </div>
          <div class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">How to use this</p>
            <p class="mt-3 text-sm leading-7 text-slate-700">Work through each category in order, translate the creator’s guidance into action, and use the summaries to avoid shallow execution.</p>
          </div>
        </div>
      </section>
      <div class="space-y-6">${categories}</div>
      ${renderSummarySection(input)}
    `;
}

type RenderInput = {
    productType: ProductType;
    productTitle: string;
    creatorHandle: string;
    creatorDisplayName: string;
    creatorDna: CreatorDNA;
    creativeDirection: CreativeDirection;
    blueprint: TextBlueprint;
    selectedContexts: SelectedContext[];
    palette: {
        primary: string;
        secondary: string;
        background: string;
        text: string;
    };
    sections: BlueprintSection[];
};

function renderSummarySection(input: RenderInput): string {
    if (input.blueprint.keyTakeaways.length === 0) return '';
    const items = input.blueprint.keyTakeaways.slice(0, 6).map((item) => `
      <li class="rounded-2xl border border-slate-200 bg-card px-4 py-3 text-sm leading-7 text-slate-700 shadow-sm">${escapeHtml(item)}</li>
    `).join('');

    return `
      <section class="mt-8 rounded-[28px] border border-slate-200 bg-card p-6 shadow-sm sm:p-8">
        <h2 class="text-2xl font-semibold tracking-tight text-slate-950">Key takeaways</h2>
        <ul class="mt-5 grid gap-3 sm:grid-cols-2">${items}</ul>
      </section>
    `;
}

function renderFaqSection(input: RenderInput): string {
    if (input.blueprint.faq.length === 0) return '';
    const items = input.blueprint.faq.slice(0, 5).map((item, index) => `
      <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">FAQ ${index + 1}</p>
        <h3 class="mt-2 text-lg font-semibold text-slate-950">${escapeHtml(item.question)}</h3>
        <p class="mt-3 text-sm leading-7 text-slate-700">${escapeHtml(item.answer)}</p>
      </article>
    `).join('');

    return `
      <section class="mt-8 rounded-[28px] border border-slate-200 bg-card p-6 shadow-sm sm:p-8">
        <h2 class="text-2xl font-semibold tracking-tight text-slate-950">Frequently asked questions</h2>
        <div class="mt-5 grid gap-4">${items}</div>
      </section>
    `;
}

function renderTakeawayBox(section: BlueprintSection): string {
    const items = deriveChecklistItems(section).slice(0, 3);
    if (items.length === 0) return '';
    return `
      <div class="mt-6 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Implementation moves</p>
        <ul class="mt-4 space-y-3">
          ${items.map((item) => `<li class="text-sm leading-7 text-slate-700">${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    `;
}

function renderActionList(
    section: { body: string },
    label: string
): string {
    const items = deriveChecklistItems(section).slice(0, 4);
    if (items.length === 0) return '';
    return `
      <div class="mt-6 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">${escapeHtml(label)}</p>
        <div class="mt-4 grid gap-3">
          ${items.map((item, index) => `
            <div class="flex gap-3">
              <span class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-700">${index + 1}</span>
              <p class="text-sm leading-7 text-slate-700">${escapeHtml(item)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
}

function buildChallengeDays(
    sections: BlueprintSection[],
    contexts: SelectedContext[]
): BlueprintSection[] {
    const padded = [...sections];
    let cursor = 0;

    while (padded.length < 7 && contexts.length > 0) {
        const context = contexts[cursor % contexts.length];
        padded.push({
            id: `day-${padded.length + 1}`,
            title: context.title || `Day ${padded.length + 1}`,
            body: context.transcriptContext.slice(0, 1200),
            sourceVideoIds: [context.videoId],
        });
        cursor += 1;
    }

    return padded.slice(0, 7);
}

function deriveChecklistItems(
    section: { body: string; sourceVideoIds?: string[] },
    contexts?: SelectedContext[]
): string[] {
    const candidate = section.body
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 32)
        .slice(0, 5);

    if (candidate.length > 0) return candidate;

    if (contexts && section.sourceVideoIds) {
        const fallback = contexts.find((context) => section.sourceVideoIds?.includes(context.videoId));
        if (fallback) {
            return fallback.transcriptContext
                .split(/(?<=[.!?])\s+/)
                .map((sentence) => sentence.trim())
                .filter((sentence) => sentence.length > 32)
                .slice(0, 4);
        }
    }

    return [];
}

function mergeEvidence(section: BlueprintSection, contexts: SelectedContext[]): string {
    const evidence = contexts
        .filter((context) => section.sourceVideoIds.includes(context.videoId))
        .map((context) => trimWords(context.transcriptContext, 120))
        .filter(Boolean)
        .slice(0, 2)
        .join('\n\n');

    return evidence ? `${section.body}\n\n${evidence}` : section.body;
}

function renderParagraphs(text: string): string {
    return text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join('');
}

function trimWords(text: string, maxWords: number): string {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return text.trim();
    return `${words.slice(0, maxWords).join(' ')}…`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
