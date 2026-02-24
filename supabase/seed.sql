-- Seed data for Owny development
-- PRD §M13: Seed DSL examples for renderer testing

-- Test creator profile (assumes auth user with this ID exists or will be created)
-- In dev, create a test user via Supabase dashboard first, then update this ID.
-- Using a deterministic UUID for reproducibility:
INSERT INTO public.profiles (id, email, role, created_at)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'creator@test.owny.store', 'creator', now()),
    ('00000000-0000-0000-0000-000000000002', 'buyer@test.owny.store', 'buyer', now())
ON CONFLICT (id) DO NOTHING;

-- Test creator
INSERT INTO public.creators (id, profile_id, handle, display_name, bio, brand_tokens, stripe_connect_status, created_at)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'testcreator',
    'Test Creator',
    'A demo creator for testing the Owny platform.',
    '{
        "primaryColor": "#6366f1",
        "secondaryColor": "#8b5cf6",
        "backgroundColor": "#ffffff",
        "textColor": "#1f2937",
        "fontFamily": "inter",
        "mood": "professional"
    }'::jsonb,
    'connected',
    now()
)
ON CONFLICT (id) DO NOTHING;

-- 10 test videos
INSERT INTO public.videos (id, creator_id, source, external_video_id, url, title, description, views, likes, duration, created_at_source)
VALUES
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'scrapecreators', 'vid001', 'https://tiktok.com/@test/video/001', '5 Tips for Morning Productivity', 'How to start your day right', 150000, 12000, 60, now() - interval '30 days'),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'scrapecreators', 'vid002', 'https://tiktok.com/@test/video/002', 'The Power of Journaling', 'Why journaling changes everything', 98000, 8500, 45, now() - interval '28 days'),
    ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'scrapecreators', 'vid003', 'https://tiktok.com/@test/video/003', 'How I Read 50 Books a Year', 'Speed reading and retention tips', 220000, 18000, 90, now() - interval '25 days'),
    ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'scrapecreators', 'vid004', 'https://tiktok.com/@test/video/004', 'Building a Second Brain', 'Note-taking systems explained', 175000, 14000, 75, now() - interval '22 days'),
    ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'scrapecreators', 'vid005', 'https://tiktok.com/@test/video/005', 'The 80/20 Rule for Learning', 'Focus on what matters', 130000, 11000, 55, now() - interval '20 days'),
    ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'scrapecreators', 'vid006', 'https://tiktok.com/@test/video/006', 'Deep Work vs Shallow Work', 'How to do more meaningful work', 89000, 7200, 65, now() - interval '18 days'),
    ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'scrapecreators', 'vid007', 'https://tiktok.com/@test/video/007', 'Why Exercise Boosts Focus', 'The science of movement and cognition', 67000, 5500, 50, now() - interval '15 days'),
    ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'scrapecreators', 'vid008', 'https://tiktok.com/@test/video/008', 'My Notion Setup for Creators', 'Templates and workflows', 145000, 12500, 120, now() - interval '12 days'),
    ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'scrapecreators', 'vid009', 'https://tiktok.com/@test/video/009', 'How to Monetize Your Content', 'Revenue streams for creators', 310000, 25000, 85, now() - interval '8 days'),
    ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'scrapecreators', 'vid010', 'https://tiktok.com/@test/video/010', 'The Creator Economy in 2025', 'Trends and opportunities', 195000, 16000, 70, now() - interval '5 days')
ON CONFLICT (id) DO NOTHING;

-- Test product 1: PDF Guide
INSERT INTO public.products (id, creator_id, slug, type, title, description, status, access_type, price_cents, currency, created_at)
VALUES (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'productivity-blueprint',
    'pdf_guide',
    'The Productivity Blueprint',
    'A comprehensive guide to morning routines, deep work, and focus systems.',
    'published',
    'paid',
    1999,
    'usd',
    now()
)
ON CONFLICT (id) DO NOTHING;

-- Test product 2: Mini Course
INSERT INTO public.products (id, creator_id, slug, type, title, description, status, access_type, price_cents, currency, created_at)
VALUES (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'creator-monetization-101',
    'mini_course',
    'Creator Monetization 101',
    'Learn how to turn your content into revenue streams.',
    'published',
    'paid',
    4999,
    'usd',
    now()
)
ON CONFLICT (id) DO NOTHING;

-- Product versions with seed DSL (from PRD §13)
INSERT INTO public.product_versions (id, product_id, version_number, build_packet, dsl_json, source_video_ids, created_at)
VALUES (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    1,
    '{
        "title": "The Productivity Blueprint",
        "productType": "pdf_guide",
        "source": "seed"
    }'::jsonb,
    '{
        "pages": [
            {
                "id": "cover",
                "type": "cover",
                "blocks": [
                    {
                        "id": "b1",
                        "type": "hero",
                        "variant": "centered",
                        "props": {
                            "headline": "The Productivity Blueprint",
                            "subheadline": "Master your mornings, focus deeply, and get more done.",
                            "ctaLabel": "Start Reading"
                        }
                    }
                ]
            },
            {
                "id": "content-1",
                "type": "content",
                "blocks": [
                    {
                        "id": "b2",
                        "type": "text",
                        "variant": "body",
                        "props": {
                            "content": "This guide compiles the best strategies from top productivity creators into one actionable blueprint."
                        }
                    },
                    {
                        "id": "b3",
                        "type": "list",
                        "variant": "numbered",
                        "props": {
                            "items": [
                                "Wake up at the same time every day",
                                "Start with 90 minutes of deep work",
                                "Use the 80/20 rule to prioritize tasks",
                                "Journal for 10 minutes before bed",
                                "Review and plan your next day"
                            ]
                        }
                    },
                    {
                        "id": "b4",
                        "type": "callout",
                        "variant": "tip",
                        "props": {
                            "title": "Pro Tip",
                            "content": "The best productivity system is the one you actually follow. Start small and build up."
                        }
                    }
                ]
            }
        ],
        "theme": {
            "primaryColor": "#6366f1",
            "secondaryColor": "#8b5cf6",
            "backgroundColor": "#ffffff",
            "textColor": "#1f2937",
            "fontFamily": "inter",
            "borderRadius": "md",
            "spacing": "normal",
            "shadow": "sm",
            "mood": "professional"
        },
        "metadata": {
            "title": "The Productivity Blueprint",
            "productType": "pdf_guide",
            "generatedAt": "2025-01-01T00:00:00Z"
        }
    }'::jsonb,
    ARRAY['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000006']::uuid[],
    now()
)
ON CONFLICT (id) DO NOTHING;

-- Set active versions
UPDATE public.products SET active_version_id = '40000000-0000-0000-0000-000000000001' WHERE id = '30000000-0000-0000-0000-000000000001';

-- Test entitlement for buyer
INSERT INTO public.entitlements (buyer_profile_id, product_id, status, granted_via)
VALUES ('00000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'active', 'purchase')
ON CONFLICT (buyer_profile_id, product_id) DO NOTHING;

-- Test order
INSERT INTO public.orders (id, buyer_profile_id, product_id, status, amount_cents, currency)
VALUES ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'paid', 1999, 'usd')
ON CONFLICT (id) DO NOTHING;
