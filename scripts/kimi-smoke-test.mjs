import OpenAI from 'openai';

const apiKey = process.env.KIMI_API_KEY;
if (!apiKey) {
  console.error('KIMI_API_KEY is not set');
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
});
const model = process.env.KIMI_MODEL || 'kimi-k2.5';

async function main() {
  const response = await client.chat.completions.create(
    {
      model,
      messages: [
        {
          role: 'system',
          content:
            'Return only valid JSON with keys status, builder, artifact, and note. No markdown fences.',
        },
        {
          role: 'user',
          content:
            'Confirm that you are reachable for Owny digital product generation. artifact should be "html".',
        },
      ],
      thinking: { type: 'disabled' },
      temperature: 0.6,
      max_tokens: 200,
    }
  );

  const content = (response.choices[0]?.message?.content?.trim() || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error('Kimi returned non-JSON content');
    console.error(content);
    process.exit(1);
  }

  if (typeof parsed?.status !== 'string' || parsed?.artifact !== 'html') {
    console.error('Unexpected smoke test payload');
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        model: response.model || model,
        status: parsed.status,
        builder: parsed.builder,
        artifact: parsed.artifact,
        note: parsed.note,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
