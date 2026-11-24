import type { ReactNode } from 'react';

/**
 * A template (unlike a layout) is created afresh on every navigation, so each page fades
 * up gently as it opens. The sidebar, in the layout, stays still.
 */
export default function PageTransition({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="animate-rise">{children}</div>;
}
