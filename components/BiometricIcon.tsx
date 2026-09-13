'use client';

import { useEffect, useState } from 'react';
import { biometryKind, type BiometryKind } from '@/lib/biometric';
import { FaceIdIcon, FingerprintIcon } from './icons';

/** رمزُ البصمة الذي يعرفه المستخدم — الوجهُ على آيفون، والإصبعُ على أندرويد.
 *
 *  «أضف شكلَ بصمة الوجه للآيفون وبصمةَ اليد أو الوجه للأندرويد، تكون واضحة»
 *  — صاحبُ المنصّة. النوعُ يُقرأ من الإضافة (`biometryType`) لا يُخمَّن من
 *  المنصّة: آيفونٌ قديمٌ ببصمة إصبع يرى إصبعاً، وأندرويدٌ بوجهٍ يرى وجهاً،
 *  ومن عنده الاثنان يراهما معاً. */
export function BiometricIcon({ kind, className = 'h-6 w-6' }: { kind: BiometryKind; className?: string }) {
  if (kind === 'face') return <FaceIdIcon className={className} />;
  if (kind === 'finger') return <FingerprintIcon className={className} />;
  if (kind === 'both')
    return (
      <span className="inline-flex items-center gap-1.5">
        <FaceIdIcon className={className} />
        <FingerprintIcon className={className} />
      </span>
    );
  return null;
}

/** يقرأ النوعَ مرّةً عند التركيب — `'none'` في المتصفّح وفي بناءٍ قديم. */
export function useBiometryKind(): BiometryKind {
  const [kind, setKind] = useState<BiometryKind>('none');
  useEffect(() => {
    let alive = true;
    biometryKind().then((k) => alive && setKind(k));
    return () => {
      alive = false;
    };
  }, []);
  return kind;
}
