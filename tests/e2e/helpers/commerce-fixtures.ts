import {
  createAdminSupabase,
  createAuthUser,
  uniqueToken,
  type UserFixture,
} from './supabase-fixtures';

export interface CommerceFixture {
  slug: string;
  title: string;
  buyer: UserFixture;
  creator: UserFixture & { handle: string };
  accessType: 'paid' | 'public';
}


export async function seedCommerceFixture(input: {
  accessType: 'paid' | 'public';
}): Promise<CommerceFixture> {
  const admin = createAdminSupabase();
  const token = uniqueToken();
  const buyer = await createAuthUser(admin, {
    email: `buyer-${token}@owny-e2e.local`,
    password: `Buyer-${token}`,
    role: 'buyer',
  });
  const creatorUser = await createAuthUser(admin, {
    email: `creator-${token}@owny-e2e.local`,
    password: `Creator-${token}`,
    role: 'creator',
  });
  const creatorHandle = `creator-${token}`.slice(0, 28);

  const { data: creatorRow, error: creatorError } = await admin
    .from('creators')
    .insert({
      profile_id: creatorUser.id,
      handle: creatorHandle,
      display_name: `Creator ${token}`,
      bio: 'E2E commerce creator fixture',
      brand_tokens: {
        primaryColor: '#0f766e',
        secondaryColor: '#14b8a6',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        fontFamily: 'Georgia',
      },
      stripe_connect_account_id: input.accessType === 'paid' ? `acct_${token.replace(/[^a-z0-9]/gi, '')}` : null,
      stripe_connect_status: input.accessType === 'paid' ? 'connected' : 'unconnected',
    })
    .select('id, handle')
    .single();

  if (creatorError || !creatorRow) {
    throw new Error(`Failed to create creator fixture: ${creatorError?.message || 'Unknown error'}`);
  }

  const slug = `commerce-${input.accessType}-${token}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 58);
  const title = input.accessType === 'paid'
    ? `Paid Commerce Product ${token}`
    : `Free Commerce Product ${token}`;

  const { data: productRow, error: productError } = await admin
    .from('products')
    .insert({
      creator_id: creatorRow.id,
      slug,
      type: 'mini_course',
      title,
      description: `${input.accessType} commerce fixture product`,
      status: 'published',
      access_type: input.accessType,
      price_cents: input.accessType === 'paid' ? 7900 : 0,
      currency: 'usd',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (productError || !productRow) {
    throw new Error(`Failed to create product fixture: ${productError?.message || 'Unknown error'}`);
  }

  const generatedHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="font-family: Georgia, serif; margin: 0; background: #f8fafc; color: #0f172a;">
    <main style="max-width: 720px; margin: 0 auto; padding: 40px 24px 80px;">
      <h1>${title}</h1>
      <p>This is the seeded ${input.accessType} commerce journey product.</p>
      <section>
        <h2>Module One</h2>
        <p>Start with the buyer handoff and fulfillment flow.</p>
        <button type="button">Start Module</button>
      </section>
      <section>
        <h2>Module Two</h2>
        <p>Review the post-purchase library experience.</p>
      </section>
    </main>
  </body>
</html>`;

  const { data: versionRow, error: versionError } = await admin
    .from('product_versions')
    .insert({
      product_id: productRow.id,
      version_number: 1,
      build_packet: {
        productType: 'mini_course',
        qualityOverallPassed: true,
        browserQaPassed: true,
      },
      dsl_json: {},
      generated_html: generatedHtml,
      source_video_ids: [],
    })
    .select('id')
    .single();

  if (versionError || !versionRow) {
    throw new Error(`Failed to create version fixture: ${versionError?.message || 'Unknown error'}`);
  }

  const { error: activateError } = await admin
    .from('products')
    .update({ active_version_id: versionRow.id })
    .eq('id', productRow.id);

  if (activateError) {
    throw new Error(`Failed to activate product fixture: ${activateError.message}`);
  }

    return {
        slug,
        title,
        accessType: input.accessType,
        buyer,
        creator: {
            ...creatorUser,
            handle: (creatorRow.handle as string) || creatorHandle,
        },
    };
}

export async function cleanupCommerceFixture(fixture: CommerceFixture): Promise<void> {
  const admin = createAdminSupabase();

  await Promise.allSettled([
    admin.auth.admin.deleteUser(fixture.buyer.id),
    admin.auth.admin.deleteUser(fixture.creator.id),
  ]);
}
