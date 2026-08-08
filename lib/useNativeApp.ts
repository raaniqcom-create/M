'use client';

import { useEffect, useState } from 'react';

/** True inside the Android/iOS shells. Anything that offers to install the app
 *  is noise to someone already holding it, so those bits ask here first.
 *  Starts false and flips after mount: the server has no idea which shell is
 *  asking, and guessing would mismatch on hydration. */
export function useNativeApp(): boolean {
  const [native, setNative] = useState(false);

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    setNative(Boolean(cap?.isNativePlatform?.()));
  }, []);

  return native;
}
