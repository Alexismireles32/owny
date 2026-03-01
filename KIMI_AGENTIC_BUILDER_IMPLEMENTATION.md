# Kimi Agentic Builder (Owny)

Last verified: February 27, 2026  
Docs index freshness: Moonshot sitemap entries show `lastmod` on January 22, 2026.
Surface scan: 84 docs URLs discovered from sitemap, then narrowed to agentic-relevant pages listed below.

## Goal

Use Kimi as the planner and code builder for digital products.

## Moonshot docs reviewed for agentic behavior

Primary index:
- https://platform.moonshot.ai/docs/overview
- https://platform.moonshot.cn/sitemap-0.xml

Agentic and tool-loop docs:
- https://platform.moonshot.ai/docs/guide/kimi-k2-5-quickstart
- https://platform.moonshot.ai/docs/guide/use-kimi-k2-thinking-model
- https://platform.moonshot.ai/docs/api/tool-use
- https://platform.moonshot.ai/docs/guide/use-kimi-api-to-complete-tool-calls
- https://platform.moonshot.ai/docs/guide/use-official-tools
- https://platform.moonshot.ai/docs/guide/use-web-search
- https://platform.moonshot.ai/docs/guide/use-kimi-k2-to-setup-agent
- https://platform.moonshot.ai/docs/guide/utilize-the-streaming-output-feature-of-kimi-api

## Key implementation rules derived from docs

1. Use OpenAI-compatible client with Moonshot base URL:
   - `baseURL=https://api.moonshot.ai/v1`
2. K2.5 non-thinking mode for stable code generation:
   - send `thinking: { type: "disabled" }`
   - use `temperature: 0.6`
3. If using thinking mode with multi-step tools:
   - preserve and forward `reasoning_content`
   - keep `max_tokens >= 16000`
   - prefer `stream=true`
4. Tool loop contract:
   - when model returns `finish_reason=tool_calls`, execute all tool calls
   - return `role=tool` messages with aligned `tool_call_id`
   - do not omit any tool result in the round
5. Official formula tools:
   - use formula URIs like `moonshot/web-search:latest`
   - map loaded tool names to formula URIs for execution
6. Web search billing model:
   - account for search tokens and response tokens in pricing flow

## What is now implemented in Owny

1. New Kimi agentic code builder:
   - `src/lib/ai/kimi-agentic-code-builder.ts`
   - custom validator tool: `validate_generated_product_html`
   - strict tool-call loop with aligned `tool_call_id`
   - final HTML is rejected unless Kimi used the validator and deterministic validation passes
   - optional Moonshot official formula tools via `KIMI_ENABLE_FORMULAS=true`
2. Product build flow now:
   - Kimi: text blueprint planning
   - Kimi: product HTML generation and iterative code refinement
3. Non-text planning helpers now use Kimi:
   - `src/lib/ai/reranker.ts`
   - `src/lib/ai/planner.ts`
4. Critic loop uses Kimi for HTML revisions:
   - `src/lib/ai/critic-loop.ts`
5. Improve/edit endpoints now use Kimi for HTML edits:
   - `src/app/api/products/improve/route.ts`
   - `src/app/api/ai/improve-block/route.ts`
   - `src/lib/ai/router.ts`
6. Failed-quality builds are not persisted:
   - `/api/products/build` rejects and cleans up unsaved product rows when hard gates fail
   - `/api/ai/build-product` returns `422` with `manualEditRequired`

## Current operating contract

1. Kimi plans, builds, and revises product output in the primary build flow.
2. Tool-call wiring remains deterministic and auditable in logs.
