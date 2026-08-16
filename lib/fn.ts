import { supabase } from './supabase';

/** Calls an edge function as the signed-in user, and says what actually failed.
 *
 *  Every caller used to write this by hand:
 *
 *      Authorization: `Bearer ${sess.session?.access_token ?? ''}`
 *      ...
 *      .catch(() => null)
 *
 *  Two faults, repeated eleven times. The `?? ''` turns "no session" into a
 *  header the gateway rejects, so a missing session arrives looking like a
 *  rejected account. And the catch throws the status away, so 401, 403, 404,
 *  500, a timeout and a dead connection all reach the human as one sentence —
 *  which then blames whichever cause the author happened to have in mind.
 *
 *  The admin saw «تأكد أنك داخل بحساب الإدارة» while signed in as the admin,
 *  because the real answer was a gateway 401 about the token's signature.
 *
 *  So: keep the status, name the cause, and never blame the account for
 *  something the account did not do. */
export interface FnResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Arabic, ready to show. null when ok. */
  error: string | null;
}

const TIMEOUT_MS = 20000;

export async function callFn<T = unknown>(
  path: string,
  body?: unknown
): Promise<FnResult<T>> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;

  // No session at all is its own answer. Sending `Bearer ` and reporting the
  // gateway's reply would describe the symptom instead of the cause.
  if (!token) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'انتهت جلستك. سجّل الدخول من جديد.',
    };
  }

  let res: Response;
  try {
    res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${token}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // The supabase client times its own requests out; a raw fetch does not,
      // and a hanging vendor left this panel spinning with nothing to read.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'TimeoutError';
    return {
      ok: false,
      status: 0,
      data: null,
      error: timedOut
        ? 'استغرق الفحص وقتاً أطول من اللازم. أعد المحاولة.'
        : 'تعذّر الاتصال بالخادم. تحقّق من الإنترنت.',
    };
  }

  const out = (await res.json().catch(() => null)) as
    | (T & { error?: string; message?: string })
    | null;

  if (res.ok) return { ok: true, status: res.status, data: out as T, error: null };

  // The gateway and the function disagree about the field name: the gateway
  // answers {message}, our own functions answer {error}. Reading only one of
  // them turned a clear reply into «تعذّر الاتصال».
  const said = out?.error ?? out?.message ?? null;

  return {
    ok: false,
    status: res.status,
    data: null,
    error: describe(res.status, said),
  };
}

function describe(status: number, said: string | null): string {
  switch (status) {
    case 401:
      // Not the account's fault. Either the session aged out or the token's
      // signature is one the gateway will not accept.
      return 'الجلسة غير مقبولة. سجّل الخروج ثم الدخول من جديد.';
    case 403:
      // The one case that really is about who is signed in.
      return 'هذا الإجراء لحساب الإدارة فقط.';
    case 404:
      return 'الخدمة غير منشورة على الخادم.';
    case 429:
      return 'محاولات كثيرة في وقت قصير. انتظر قليلاً.';
    default:
      if (status >= 500) return `عطل في الخادم (${status})${said ? ` — ${said}` : ''}.`;
      return said ?? `تعذّر التنفيذ (${status}).`;
  }
}
