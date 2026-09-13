'use client';

import { useEffect, useState } from 'react';
import { platformStory, type PlatformStoryRow } from '@/lib/stories';
import { StoryViewer } from './StoryViewer';

/** الحالةُ مُحمَّلةٌ في الرابط (base64url لصفّ platform_stories) — «لم أشاهد
 *  الحالات!»: صاحبُ المنصّة يتابع من هاتفه، فرابطٌ يفتح المعاينةَ نفسَها أينما كان. */
export function encodeStory(row: PlatformStoryRow): string {
  const json = JSON.stringify(row);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeStory(d: string): PlatformStoryRow | null {
  try {
    const b64 = d.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const row = JSON.parse(new TextDecoder().decode(bytes)) as PlatformStoryRow;
    return row && typeof row.title === 'string' && Array.isArray(row.lines) ? row : null;
  } catch {
    return null;
  }
}

export function StoryPreview() {
  const [row, setRow] = useState<PlatformStoryRow | null | undefined>(undefined);
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('d') ?? '';
    setRow(decodeStory(d));
  }, []);

  if (row === undefined) return null;
  if (!row) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center text-sm text-slate-500">
        رابطُ معاينةٍ غيرُ صالح.
      </main>
    );
  }
  return (
    <StoryViewer
      stories={[platformStory({ ...row, id: 'preview' })]}
      start={0}
      stations={[]}
      onClose={() => (history.length > 1 ? history.back() : (location.href = '/'))}
    />
  );
}
