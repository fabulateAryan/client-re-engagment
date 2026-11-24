'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import { ChevronsUpDown, LogOut, UserCog } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { SIGN_IN_PATH } from '../lib/auth-routes';
import { initials } from '../lib/format';
import { ConfirmDialog } from './confirm-dialog';
import { toast } from './toast';
import { cx } from './ui';

function Avatar({ src, name, size }: { src: string | null; name: string; size: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-9 w-9 text-xs' : 'h-8 w-8 text-[11px]';
  return src !== null ? (
    // Clerk serves the image; next/image would need its host allowed for no gain here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={cx(box, 'shrink-0 rounded-full object-cover ring-2 ring-violet-100')}
    />
  ) : (
    <span
      className={cx(
        box,
        'grid shrink-0 place-items-center rounded-full bg-linear-to-br from-violet-500 to-cyan-400 font-semibold text-white ring-2 ring-violet-100',
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Who is signed in, and their menu (manage account, sign out).
 * `sidebar`: the full card at the bottom of the sidebar, menu opens upwards.
 * `compact`: just the avatar (mobile header), menu opens downwards.
 */
export function UserMenu({ variant }: { variant: 'sidebar' | 'compact' }) {
  const { user, isLoaded } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isLoaded || user === null || user === undefined) {
    return variant === 'sidebar' ? (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
        <span className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
        <span className="flex-1 space-y-1.5">
          <span className="block h-3 w-24 animate-pulse rounded bg-slate-200" />
          <span className="block h-2.5 w-32 animate-pulse rounded bg-slate-100" />
        </span>
      </div>
    ) : (
      <span className="block h-8 w-8 animate-pulse rounded-full bg-slate-200" />
    );
  }

  const email = user.primaryEmailAddress?.emailAddress ?? null;
  const name = user.fullName ?? user.username ?? email ?? 'Signed in';
  const image = user.hasImage ? user.imageUrl : null;

  const menu = open && (
    <div
      id={menuId}
      role="menu"
      className={cx(
        'animate-rise absolute z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10',
        // Sidebar: exactly as wide as the card, so it stays inside the sidebar's edge.
        variant === 'sidebar' ? 'inset-x-0 bottom-full mb-2' : 'top-full right-0 mt-2 w-64',
      )}
    >
      <div className="flex items-center gap-3 border-b border-slate-100 p-3">
        <Avatar src={image} name={name} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900" title={name}>
            {name}
          </p>
          {email !== null && email !== name && (
            <p className="truncate text-xs text-slate-500" title={email}>
              {email}
            </p>
          )}
        </div>
      </div>
      <div className="p-1.5">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            openUserProfile();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 transition hover:bg-violet-50 hover:text-violet-800"
        >
          <UserCog className="h-4 w-4" aria-hidden />
          Manage account
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            setConfirmingSignOut(true);
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-rose-700 transition hover:bg-rose-50"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      {variant === 'sidebar' ? (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
          title={email ?? name}
          className={cx(
            'flex w-full items-center gap-3 rounded-xl border bg-white p-2.5 text-left transition',
            open
              ? 'border-violet-300 ring-4 ring-violet-100'
              : 'border-slate-200 hover:border-violet-200 hover:bg-violet-50/40',
          )}
        >
          <Avatar src={image} name={name} size="md" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
            {email !== null && email !== name && (
              <span className="mt-0.5 block truncate text-[11px] text-slate-500">{email}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label="Account menu"
          onClick={() => setOpen((v) => !v)}
          className="block rounded-full transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
        >
          <Avatar src={image} name={name} size="sm" />
        </button>
      )}
      {menu}
      <ConfirmDialog
        open={confirmingSignOut}
        icon={LogOut}
        title="Sign out?"
        description={
          email !== null
            ? `You will need to sign in again to use the app as ${email}.`
            : 'You will need to sign in again to use the app.'
        }
        confirmLabel={signingOut ? 'Signing out' : 'Sign out'}
        busy={signingOut}
        onCancel={() => setConfirmingSignOut(false)}
        onConfirm={() => {
          setSigningOut(true);
          signOut({ redirectUrl: SIGN_IN_PATH }).catch(() => {
            setSigningOut(false);
            setConfirmingSignOut(false);
            toast({ tone: 'error', title: 'Could not sign out', description: 'Please try again.' });
          });
        }}
      />
    </div>
  );
}
