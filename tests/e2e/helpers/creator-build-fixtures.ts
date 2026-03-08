import { createAdminSupabase, createAuthUser, uniqueToken, type UserFixture } from './supabase-fixtures';

export interface CreatorBuildFixture {
  creator: UserFixture & {
    handle: string;
    displayName: string;
    creatorId: string;
  };
  prompt: string;
  improvePrompt: string;
  expectedTopic: string;
}

interface SeedVideoInput {
  externalId: string;
  title: string;
  description: string;
  transcript: string;
  views: number;
  likes: number;
  topicTags: string[];
  keySteps: string[];
  whoItsFor: string;
  outcome: string;
  bestHook: string;
  postedAt: string;
}

function splitTranscriptIntoChunks(transcript: string): string[] {
  return transcript
    .split(/\n\s*\n/)
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter((chunk) => chunk.length > 0);
}

async function seedVideoLibrary(input: {
  creatorId: string;
  token: string;
}) {
  const admin = createAdminSupabase();
  const creatorId = input.creatorId;

  const videos: SeedVideoInput[] = [
    {
      externalId: `batch-map-${input.token}`,
      title: 'How I Batch 7 TikToks in One Afternoon',
      description: 'The exact batching workflow I use to plan, film, and edit a week of TikToks in one focused block.',
      transcript: `Today I want to show you the content batching system that lets me create a full week of TikToks in one afternoon without frying my brain.

The first rule is that I never start by filming. I start with a content map. I open one page in Notion, write the audience problem for the week, then I list seven short angles that all point back to one transformation. That way every video feels connected and I am not inventing ideas on the spot.

The second rule is that I batch by energy. I write hooks first while I am sharp, then I outline talking points, then I film every intro in one run, then every body section, then every call to action. When creators try to finish one video at a time they waste energy resetting the camera, changing tone, and deciding what to say next.

The third rule is that every batch needs a finish line. My finish line is seven clean drafts, seven cover ideas, and a simple posting order. If I leave the session with random raw footage, I did not batch content, I just made a mess with good intentions.

If you want consistency without burnout, content batching has to feel like a production line for one creator, not a marathon of motivation.`,
      views: 184000,
      likes: 12600,
      topicTags: ['content batching', 'tiktok workflow', 'creator systems', 'weekly planning'],
      keySteps: [
        'Start with a weekly content map',
        'Group ideas around one audience problem',
        'Batch by energy instead of by video',
        'Leave with finished drafts and cover ideas',
      ],
      whoItsFor: 'Creators who want to publish consistently without spending every day making content.',
      outcome: 'A repeatable one-afternoon workflow for planning and producing a week of TikToks.',
      bestHook: 'If batching your content still feels chaotic, your system is missing these four moves.',
      postedAt: '2025-11-12T18:00:00.000Z',
    },
    {
      externalId: `notion-pipeline-${input.token}`,
      title: 'My Notion Content Pipeline for Weekly Posting',
      description: 'How I keep ideas, hooks, filming notes, and publishing tasks in one creator operating system.',
      transcript: `A lot of creators think batching fails because they need more discipline. Most of the time batching fails because the workflow is hidden inside five different apps.

My content pipeline lives in one dashboard. Every idea gets tagged with a stage: capture, shape, script, film, edit, ship. Once I can see the stage, I stop treating all content like one giant to-do list. That single change makes batching dramatically easier because I can pull the same stage together and finish it in one focused session.

Inside each idea card I keep three things: the hook, the payoff, and the call to action. If I cannot explain those three things in a few lines, the video is not ready to film. That prevents me from sitting in front of the camera trying to think while the red light is on.

When batch day arrives, I sort the board by stage and record everything that is in the film column. Then I move to edit. Then I move to schedule. The pipeline keeps me calm because the work is visible, and visible work is easier to finish.

If you are trying to batch content like a professional, you need a pipeline that turns creative chaos into a small set of repeatable stages.`,
      views: 149000,
      likes: 9700,
      topicTags: ['notion system', 'content pipeline', 'creator workflow', 'batch planning'],
      keySteps: [
        'Track each idea by stage',
        'Store hook, payoff, and CTA together',
        'Film everything in the same stage at once',
        'Move work forward stage by stage',
      ],
      whoItsFor: 'Creators who need a calmer operating system for planning and shipping content.',
      outcome: 'A visible workflow that removes decision fatigue from batch day.',
      bestHook: 'Batching gets easier the moment your ideas stop living in five different places.',
      postedAt: '2025-11-19T18:00:00.000Z',
    },
    {
      externalId: `hook-library-${input.token}`,
      title: 'The Hook Library That Makes Batch Filming Faster',
      description: 'Build reusable hooks so batch filming stops feeling like a blank page every time.',
      transcript: `Here is the mistake that makes batch filming feel slow: you are writing a brand new opening every single time.

I keep a hook library with patterns, not perfect scripts. I have categories like mistake hooks, myth hooks, reset hooks, checklist hooks, and before-after hooks. On batch day I choose the pattern that matches the lesson and then I customize the wording for that specific audience pain point.

That means I am not starting from zero. I am starting from a proven structure. The goal is not to sound robotic. The goal is to remove the panic of inventing a good first line on camera while your energy drops.

My favorite batching routine is simple. I script ten hooks in one sitting, then I stand up and film all ten intros back to back. Once the hard part is captured, filming the body becomes easier because I already know the promise I am delivering on.

Creators who batch well do not rely on inspiration. They rely on a small library of starting points that make execution fast.`,
      views: 133000,
      likes: 9100,
      topicTags: ['hook framework', 'batch filming', 'creator prompts', 'tiktok hooks'],
      keySteps: [
        'Keep a reusable hook library',
        'Organize hooks by pattern',
        'Write intros in one sitting',
        'Film the intros back to back',
      ],
      whoItsFor: 'Creators who freeze when it is time to start filming a batch.',
      outcome: 'Faster filming sessions because the first line is already solved.',
      bestHook: 'Your batch day is slow because you keep writing hooks from scratch.',
      postedAt: '2025-11-28T18:00:00.000Z',
    },
    {
      externalId: `editing-checklist-${input.token}`,
      title: 'My Editing Checklist for Shipping a Week of Content',
      description: 'The final checklist I run so a batch turns into scheduled posts instead of unfinished drafts.',
      transcript: `Batching is not finished when the filming ends. Batching is finished when the content is ready to publish.

I use a simple editing checklist. First I trim dead air. Second I tighten the hook so the first sentence lands immediately. Third I add captions and remove any line that feels vague. Fourth I write the cover text. Fifth I decide the posting sequence so the videos tell a clear story across the week.

The reason this checklist matters is that most creators stop too early. They have footage, but no distribution-ready assets. Then the batch leaks into the rest of the week because they still need to edit, title, and schedule everything.

My rule is that a batch should reduce future stress. If your batch creates a pile of almost-done videos, it is not a batching system, it is delayed work.

Make the final stage easy to repeat. Use the same checklist, the same naming system, and the same definition of done every single week.`,
      views: 121000,
      likes: 7800,
      topicTags: ['editing checklist', 'creator consistency', 'publishing workflow', 'content batching'],
      keySteps: [
        'Trim dead air first',
        'Tighten the opening sentence',
        'Add captions and cover text',
        'Set the posting sequence before ending the session',
      ],
      whoItsFor: 'Creators whose batch days stop at raw footage instead of publish-ready assets.',
      outcome: 'A clean finish line that turns one filming block into a week of scheduled posts.',
      bestHook: 'Batching is not done when the camera turns off. It is done when the posts are ready to ship.',
      postedAt: '2025-12-03T18:00:00.000Z',
    },
  ];

  const { data: insertedVideos, error: videosError } = await admin
    .from('videos')
    .insert(videos.map((video) => ({
      creator_id: creatorId,
      source: 'manual',
      external_video_id: video.externalId,
      url: `https://example.com/${video.externalId}`,
      title: video.title,
      description: video.description,
      views: video.views,
      likes: video.likes,
      comments_count: Math.round(video.likes * 0.08),
      shares: Math.round(video.likes * 0.03),
      duration: 75,
      thumbnail_url: 'https://images.unsplash.com/photo-1493612276216-ee3925520721?auto=format&fit=crop&w=1200&q=80',
    })))
    .select('id, external_video_id');

  if (videosError || !insertedVideos) {
    throw new Error(`Failed to insert creator videos: ${videosError?.message || 'Unknown error'}`);
  }

  const videoIdByExternalId = new Map(insertedVideos.map((row) => [row.external_video_id, row.id]));

  const transcriptRows = videos.map((video) => {
    const videoId = videoIdByExternalId.get(video.externalId);
    if (!videoId) {
      throw new Error(`Missing seeded video id for ${video.externalId}`);
    }

    return {
      creator_id: creatorId,
      video_id: videoId,
      transcript_text: video.transcript,
      language: 'en',
      source: 'manual',
      platform: 'tiktok',
      title: video.title,
      description: video.description,
      views: video.views,
      likes: video.likes,
      comments: Math.round(video.likes * 0.08),
      shares: Math.round(video.likes * 0.03),
      duration_seconds: 75,
      posted_at: video.postedAt,
    };
  });

  const { error: transcriptError } = await admin
    .from('video_transcripts')
    .insert(transcriptRows);

  if (transcriptError) {
    throw new Error(`Failed to insert creator transcripts: ${transcriptError.message}`);
  }

  const chunkRows = videos.flatMap((video) => {
    const videoId = videoIdByExternalId.get(video.externalId);
    if (!videoId) return [];
    return splitTranscriptIntoChunks(video.transcript).map((chunk, index) => ({
      video_id: videoId,
      chunk_index: index,
      chunk_text: chunk,
    }));
  });

  const { error: chunkError } = await admin
    .from('transcript_chunks')
    .insert(chunkRows);

  if (chunkError) {
    throw new Error(`Failed to insert transcript chunks: ${chunkError.message}`);
  }

  const clipCardRows = videos.map((video) => {
    const videoId = videoIdByExternalId.get(video.externalId);
    if (!videoId) {
      throw new Error(`Missing seeded video id for clip card ${video.externalId}`);
    }

    return {
      video_id: videoId,
      card_json: {
        title: video.title,
        topicTags: video.topicTags,
        keySteps: video.keySteps,
        whoItsFor: video.whoItsFor,
        outcome: video.outcome,
        bestHook: video.bestHook,
      },
    };
  });

  const { error: clipCardError } = await admin
    .from('clip_cards')
    .insert(clipCardRows);

  if (clipCardError) {
    throw new Error(`Failed to insert clip cards: ${clipCardError.message}`);
  }

  const contentClusterVideoIds = videos
    .map((video) => videoIdByExternalId.get(video.externalId))
    .filter((value): value is string => typeof value === 'string');

  const { error: clusterError } = await admin
    .from('content_clusters')
    .insert({
      creator_id: creatorId,
      label: 'content batching',
      topic_summary: 'Batch planning, hook libraries, creator pipelines, and finishing workflows.',
      video_ids: contentClusterVideoIds,
      total_views: videos.reduce((sum, video) => sum + video.views, 0),
      video_count: videos.length,
      recommended_product_type: 'mini_course',
      confidence_score: 0.91,
      extracted_content: {
        pillars: ['batch planning', 'hook writing', 'filming workflow', 'editing checklist'],
      },
    });

  if (clusterError) {
    throw new Error(`Failed to insert content cluster: ${clusterError.message}`);
  }
}

export async function seedCreatorBuildFixture(): Promise<CreatorBuildFixture> {
  const admin = createAdminSupabase();
  const token = uniqueToken();
  const creatorUser = await createAuthUser(admin, {
    email: `creator-build-${token}@owny-e2e.local`,
    password: `CreatorBuild-${token}`,
    role: 'creator',
  });

  const handle = `build-${token}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 28);
  const displayName = `Batch Creator ${token.slice(-4)}`;

  const { data: creatorRow, error: creatorError } = await admin
    .from('creators')
    .insert({
      profile_id: creatorUser.id,
      handle,
      display_name: displayName,
      bio: 'Creator helping other creators batch TikToks, build cleaner workflows, and turn systems into products.',
      brand_tokens: {
        primaryColor: '#0f766e',
        secondaryColor: '#0ea5a4',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        fontFamily: 'outfit',
        mood: 'clean',
      },
      voice_profile: {
        tone: 'clear and practical',
        vocabulary: 'simple creator systems language',
        speakingStyle: 'structured and direct',
        catchphrases: ['keep it simple', 'make the workflow visible'],
        personality: 'calm operator',
        contentFocus: 'creator systems and consistency',
      },
      pipeline_status: 'ready',
      video_count: 4,
      is_claimed: true,
      follower_count: 182000,
      tiktok_url: `https://www.tiktok.com/@${handle}`,
      stripe_connect_account_id: `acct_${token.replace(/[^a-z0-9]/gi, '')}`,
      stripe_connect_status: 'connected',
    })
    .select('id')
    .single();

  if (creatorError || !creatorRow) {
    throw new Error(`Failed to create creator build fixture: ${creatorError?.message || 'Unknown error'}`);
  }

  await seedVideoLibrary({
    creatorId: creatorRow.id,
    token,
  });

  return {
    creator: {
      ...creatorUser,
      handle,
      displayName,
      creatorId: creatorRow.id,
    },
    prompt: 'Create a mini course that teaches creators how to batch a week of TikTok videos in one focused afternoon.',
    improvePrompt: 'Make the opening feel more premium, sharpen the promise, and tighten the final call to action.',
    expectedTopic: 'content batching',
  };
}

export async function cleanupCreatorBuildFixture(fixture: CreatorBuildFixture): Promise<void> {
  const admin = createAdminSupabase();

  await Promise.allSettled([
    admin.auth.admin.deleteUser(fixture.creator.id),
  ]);
}
