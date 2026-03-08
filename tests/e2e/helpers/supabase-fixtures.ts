import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface UserFixture {
  id: string;
  email: string;
  password: string;
}

export function requireEnv(name: string): string {
  const value = process.env[name] || readEnvFromDotLocal(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function readEnvFromDotLocal(name: string): string | undefined {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return undefined;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (key !== name) continue;
    const rawValue = line.slice(separatorIndex + 1).trim();
    return rawValue.replace(/^['"]|['"]$/g, '');
  }

  return undefined;
}

export function createAdminSupabase(): SupabaseClient {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export function uniqueToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createAuthUser(admin: SupabaseClient, input: {
  email: string;
  password: string;
  role: 'buyer' | 'creator';
}): Promise<UserFixture> {
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Failed to create auth user: ${error?.message || 'Unknown error'}`);
  }

  await admin.from('profiles').upsert({
    id: data.user.id,
    email: input.email,
    role: input.role,
  });

  return {
    id: data.user.id,
    email: input.email,
    password: input.password,
  };
}
