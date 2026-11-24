'use client';

import type { PlatformValue, UpdateBrandRequest } from '@signal-monitoring/shared';
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api } from '../lib/api-client';
import { Card, PlatformLogo, cx } from './ui';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 focus:outline-none';

function LogoLabel({ platform, children }: { platform: PlatformValue; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <PlatformLogo platform={platform} size="xs" />
      {children}
    </span>
  );
}

/** Hint under an optional account field: watched now, or saved until its source is on. */
function SourceHint({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-normal text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> Watched from the next
      check
    </span>
  ) : (
    <span className="text-[11px] font-normal text-slate-500">
      Saved now, watched once this source is connected
    </span>
  );
}

/**
 * Phase 1 manual brand setup: name plus LinkedIn company page; website, Instagram, TikTok and
 * YouTube optional. `connected` lists the platforms whose source is running (live or demo).
 */
export function AddBrandForm({
  startOpen = false,
  connected = [],
}: {
  startOpen?: boolean;
  connected?: readonly PlatformValue[];
}) {
  const isOn = (platform: PlatformValue): boolean => connected.includes(platform);
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError(null);
    setAdded(null);
    try {
      const brand = await api.addBrand({
        name: String(data.get('name') ?? ''),
        linkedInUrl: String(data.get('linkedInUrl') ?? ''),
        website: String(data.get('website') ?? ''),
        instagram: String(data.get('instagram') ?? ''),
        tiktok: String(data.get('tiktok') ?? ''),
        youtube: String(data.get('youtube') ?? ''),
      });
      form.reset();
      setAdded(brand.name);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add this brand.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-linear-to-r from-violet-600 to-indigo-500 px-4 text-sm font-semibold whitespace-nowrap text-white shadow-md shadow-violet-500/25 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add brand
      </button>
    );
  }

  return (
    // Full width: in a toolbar row the open form wraps onto its own line.
    <Card className="w-full basis-full p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Add a brand</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            We watch the brand&apos;s LinkedIn page for new posts. Add a website to watch news, and
            Instagram, TikTok or YouTube accounts to watch those too.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Brand name
          <input id="brand-name" name="name" required maxLength={120} className={inputClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          <LogoLabel platform="LINKEDIN">LinkedIn company page</LogoLabel>
          <input
            id="brand-linkedin"
            name="linkedInUrl"
            required
            inputMode="url"
            placeholder="linkedin.com/company/brand-name"
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          <LogoLabel platform="GOOGLE_RSS">Website (optional, for news)</LogoLabel>
          <input
            id="brand-website"
            name="website"
            inputMode="url"
            placeholder="example.com"
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          <LogoLabel platform="INSTAGRAM">Instagram (optional)</LogoLabel>
          <input
            id="brand-instagram"
            name="instagram"
            placeholder="@brand or instagram.com/brand"
            className={inputClass}
          />
          <SourceHint connected={isOn('INSTAGRAM')} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          <LogoLabel platform="TIKTOK">TikTok (optional)</LogoLabel>
          <input
            id="brand-tiktok"
            name="tiktok"
            placeholder="@brand or tiktok.com/@brand"
            className={inputClass}
          />
          <SourceHint connected={isOn('TIKTOK')} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          <LogoLabel platform="YOUTUBE">YouTube (optional)</LogoLabel>
          <input
            id="brand-youtube"
            name="youtube"
            placeholder="@brand or youtube.com/@brand"
            className={inputClass}
          />
          <SourceHint connected={isOn('YOUTUBE')} />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-progress disabled:opacity-80"
          >
            {saving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
            {saving ? 'Adding…' : 'Add brand'}
          </button>
          {error !== null && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          {added !== null && (
            <p role="status" className="text-sm text-emerald-700">
              {added} added. Use Check now on its card to get its latest posts.
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

const EDITABLE_FIELDS: {
  key: keyof UpdateBrandRequest;
  platform: PlatformValue;
  label: string;
  placeholder: string;
}[] = [
  {
    key: 'instagram',
    platform: 'INSTAGRAM',
    label: 'Instagram',
    placeholder: '@brand or instagram.com/brand',
  },
  {
    key: 'tiktok',
    platform: 'TIKTOK',
    label: 'TikTok',
    placeholder: '@brand or tiktok.com/@brand',
  },
  {
    key: 'youtube',
    platform: 'YOUTUBE',
    label: 'YouTube',
    placeholder: '@brand or youtube.com/@brand',
  },
  { key: 'website', platform: 'GOOGLE_RSS', label: 'Website (news)', placeholder: 'example.com' },
];

/**
 * Add, change or remove an existing brand's Instagram, TikTok, YouTube or website without
 * setting it up again. The LinkedIn page identifies the brand, so it is not editable here.
 */
export function EditBrandAccounts({
  clientId,
  name,
  handles,
}: {
  clientId: string;
  name: string;
  handles: Partial<Record<PlatformValue, string>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const missing = EDITABLE_FIELDS.filter((f) => (handles[f.platform] ?? '').trim() === '');

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const changes: UpdateBrandRequest = {};
    for (const field of EDITABLE_FIELDS) {
      changes[field.key] = String(data.get(field.key) ?? '');
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateBrand(clientId, changes);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save these accounts.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:border-violet-400 hover:bg-violet-50/60 hover:text-violet-700"
      >
        {missing.length > 0 ? (
          <>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add
            <span className="flex items-center gap-1">
              {missing.map((f) => (
                <PlatformLogo key={f.platform} platform={f.platform} size="xs" />
              ))}
            </span>
          </>
        ) : (
          <>
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit accounts
          </>
        )}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mt-2 space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3"
    >
      <p className="text-xs font-semibold text-slate-800">Accounts for {name}</p>
      {EDITABLE_FIELDS.map((field) => (
        <label key={field.key} className="grid gap-1 text-xs font-medium text-slate-600">
          <LogoLabel platform={field.platform}>{field.label}</LogoLabel>
          <input
            name={field.key}
            defaultValue={handles[field.platform] ?? ''}
            placeholder={field.placeholder}
            className={inputClass}
          />
        </label>
      ))}
      <p className="text-[11px] text-slate-500">
        Leave a field empty to stop watching that account. The LinkedIn page stays as it is.
      </p>
      {error !== null && (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-progress disabled:opacity-80"
        >
          {saving ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Stop monitoring a brand, with an in-page confirmation step. */
export function RemoveBrandButton({
  clientId,
  name,
  redirectTo,
}: {
  clientId: string;
  name: string;
  /** Where to go once removed (e.g. back to the list from the brand page). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.removeBrand(clientId);
      startTransition(() =>
        redirectTo === undefined ? router.refresh() : router.push(redirectTo),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove this brand.');
      setBusy(false);
    }
  };

  const linkClass =
    'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition';
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={cx(linkClass, 'text-slate-500 hover:bg-rose-50 hover:text-rose-700')}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs text-slate-600">
      Stop watching {name}?
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy}
        className={cx(linkClass, 'bg-rose-600 text-white hover:bg-rose-700')}
      >
        {busy ? 'Removing…' : 'Remove'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className={cx(linkClass, 'text-slate-500 hover:bg-slate-100')}
      >
        Cancel
      </button>
      {error !== null && (
        <span role="alert" className="w-full text-rose-700">
          {error}
        </span>
      )}
    </span>
  );
}
