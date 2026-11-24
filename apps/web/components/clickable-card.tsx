'use client';

import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { cx } from './ui';

const INTERACTIVE = 'a, button, input, textarea, select, label, form, summary, details';

/**
 * A card that opens `href` when clicked anywhere that is not itself a link, button or form.
 * Keyboard users reach the same page through the card's title link.
 */
export function ClickableCard({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const open = (event: MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE) !== null) return;
    if ((window.getSelection()?.toString() ?? '') !== '') return; // Let people copy text.
    router.push(href);
  };
  return (
    // Mouse convenience only: the title link inside is the accessible way in.
    <div onClick={open} className={cx('cursor-pointer', className)}>
      {children}
    </div>
  );
}
