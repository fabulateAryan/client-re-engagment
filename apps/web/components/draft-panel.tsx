'use client';

import type { DraftChangesRequest, DraftResponse } from '@signal-monitoring/shared';
import {
  Check,
  CircleCheck,
  Copy,
  LoaderCircle,
  Mail,
  MessageSquareText,
  RefreshCw,
  Save,
  Send,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDate } from '../lib/format';
import { OutreachThread } from './outreach-thread';
import { api } from '../lib/api-client';
import { cx } from './ui';

const SOURCE_LABEL: Record<DraftResponse['source'], string> = {
  TEMPLATE: 'Drafted from template',
  CLAUDE: 'Drafted with Claude',
};

const smallButton =
  'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400';
const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 focus:outline-none';
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Opens the rep's default email app (Outlook, Apple Mail, ...) with everything filled in. */
function mailtoLink(to: string, subject: string, body: string): string {
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${encodeURIComponent(to)}?${query}`;
}

/** Opens a new Gmail message in the browser with everything filled in. */
function gmailLink(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

type Busy = 'draft' | 'save' | 'sent' | 'send' | null;

interface EmailSetup {
  /** The From address when the app can send email (SendGrid set up), otherwise null. */
  from: string | null;
  /** True when replies come back into the app. */
  repliesInApp: boolean;
}

/** Asked once per page: can the app email drafts, from which address, and are replies shown. */
let emailSetupRequest: Promise<EmailSetup> | null = null;
function loadEmailSetup(): Promise<EmailSetup> {
  emailSetupRequest ??= api
    .emailStatus()
    .then((status) => ({
      from: status.enabled ? (status.from ?? 'the app') : null,
      repliesInApp: status.enabled && status.repliesInApp === true,
    }))
    .catch(() => {
      emailSetupRequest = null; // Try again next time.
      return { from: null, repliesInApp: false };
    });
  return emailSetupRequest;
}

/**
 * The engagement message for one signal: draft it, edit it, then open it in the rep's own
 * email (app or Gmail) to send and mark it as sent, or, when SendGrid is set up, press Send
 * to email it from the app. Nothing is sent without that click and a confirmation.
 */
export function DraftPanel({
  signalId,
  initial,
}: {
  signalId: string;
  initial: DraftResponse | null;
}) {
  const [draft, setDraft] = useState<DraftResponse | null>(initial);
  const [to, setTo] = useState(initial?.recipient ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  // A saved draft starts folded; a new one opens straight away.
  const [expanded, setExpanded] = useState(false);
  /** The From address when the app can send email, otherwise null. */
  const [emailFrom, setEmailFrom] = useState<string | null>(null);
  const [repliesInApp, setRepliesInApp] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let live = true;
    void loadEmailSetup().then((setup) => {
      if (!live) return;
      setEmailFrom(setup.from);
      setRepliesInApp(setup.repliesInApp);
    });
    return () => {
      live = false;
    };
  }, []);

  const apply = (result: DraftResponse): void => {
    setDraft(result);
    setTo(result.recipient ?? '');
    setSubject(result.subject);
    setText(result.text);
  };

  const run = async (kind: Busy, action: () => Promise<DraftResponse>): Promise<boolean> => {
    setBusy(kind);
    setError(null);
    try {
      apply(await action());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (draft === null) {
    return (
      <div className="mt-4 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() =>
            void run('draft', () => api.draftMessage(signalId)).then((ok) => setExpanded(ok))
          }
          disabled={busy !== null}
          className={cx(smallButton, 'bg-violet-50 text-violet-700 hover:bg-violet-100')}
        >
          {busy === 'draft' ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
          )}
          {busy === 'draft' ? 'Drafting…' : 'Draft message'}
        </button>
        {error !== null && (
          <p role="alert" className="mt-2 text-xs text-rose-700">
            {error}
          </p>
        )}
      </div>
    );
  }

  const changes: DraftChangesRequest = {};
  if (text.trim() !== draft.text) changes.text = text;
  if (subject.trim() !== draft.subject) changes.subject = subject;
  if (to.trim() !== (draft.recipient ?? '')) changes.recipient = to;
  const unsaved = Object.keys(changes).length > 0;
  const toValid = EMAIL.test(to.trim());
  const sent = draft.sentAt !== null;

  /** Save first, so what the rep sends is what the app records. */
  const saveIfNeeded = async (): Promise<boolean> =>
    !unsaved || run('save', () => api.saveDraft(signalId, changes));

  const openEmail = async (href: string): Promise<void> => {
    // Open the tab inside the click so pop-up blockers allow it, then save.
    const win = href.startsWith('mailto:') ? null : window.open('', '_blank');
    if (!(await saveIfNeeded())) {
      win?.close();
      return;
    }
    if (win === null) window.location.href = href;
    else win.location.href = href;
    setOpened(true);
  };

  /** Save the address (and any edits) first, so the record shows who it went to. */
  const markSent = async (): Promise<void> => {
    if (await saveIfNeeded()) await run('sent', () => api.markDraftSent(signalId, true));
  };

  /** Save any edits first, so exactly what is on screen is what gets emailed. */
  const sendEmail = async (): Promise<void> => {
    setConfirming(false);
    if (await saveIfNeeded()) await run('send', () => api.sendDraft(signalId));
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject.trim()}\n\n${text.trim()}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the text and copy it instead.');
    }
  };

  if (sent && draft.sentVia === 'SENDGRID') {
    return (
      <OutreachThread
        signalId={signalId}
        draft={draft}
        repliesInApp={repliesInApp}
        onChange={apply}
      />
    );
  }

  if (sent) {
    return (
      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <CircleCheck className="h-4 w-4" aria-hidden />
          {draft.sentVia === 'SENDGRID' ? 'Emailed from the app' : 'Sent'}
          {draft.recipient !== null && ` to ${draft.recipient}`} on {formatDate(draft.sentAt ?? '')}
        </p>
        <p className="text-xs text-slate-500">Subject: {draft.subject}</p>
        {draft.sentVia !== 'SENDGRID' && (
          <button
            type="button"
            onClick={() => void run('sent', () => api.markDraftSent(signalId, false))}
            disabled={busy !== null}
            className={cx(smallButton, 'text-slate-500 hover:bg-slate-100')}
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden /> Not sent yet
          </button>
        )}
        {error !== null && (
          <p role="alert" className="text-xs text-rose-700">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="min-w-0 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Draft ready</span>
          {unsaved && <span className="text-amber-700"> · unsaved changes</span>}
          <span className="block truncate">Subject: {subject.trim() || draft.subject}</span>
        </p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cx(smallButton, 'bg-violet-50 text-violet-700 hover:bg-violet-100')}
        >
          <MessageSquareText className="h-3.5 w-3.5" aria-hidden /> Open draft
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700">Email draft</p>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Close draft"
          title="Close. Your draft is kept."
          className={cx(smallButton, 'text-slate-500 hover:bg-slate-100 hover:text-slate-900')}
        >
          <X className="h-3.5 w-3.5" aria-hidden /> Close
        </button>
      </div>
      <label className="block text-xs font-medium text-slate-600">
        To
        <input
          id={`draft-to-${signalId}`}
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="marketing contact's email"
          className={cx(fieldClass, 'mt-1')}
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Subject
        <input
          id={`draft-subject-${signalId}`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          className={cx(fieldClass, 'mt-1')}
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Message
        <textarea
          id={`draft-${signalId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          maxLength={4000}
          className={cx(fieldClass, 'mt-1 resize-y leading-relaxed')}
        />
      </label>

      {emailFrom !== null && (
        <div className="rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-900 ring-1 ring-violet-200">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Send this outreach email to <span className="font-semibold">{to.trim()}</span> from{' '}
                {emailFrom}? It cannot be unsent.
              </span>
              <button
                type="button"
                onClick={() => void sendEmail()}
                disabled={busy !== null}
                className={cx(smallButton, 'bg-violet-600 text-white hover:bg-violet-700')}
              >
                <Send className="h-3.5 w-3.5" aria-hidden /> Yes, send now
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={cx(smallButton, 'text-slate-600 hover:bg-white')}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={!toValid || busy !== null}
                title={toValid ? `Sends from ${emailFrom}` : 'Enter an email address first'}
                className={cx(smallButton, 'bg-violet-600 text-white hover:bg-violet-700')}
              >
                {busy === 'send' ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-3.5 w-3.5" aria-hidden />
                )}
                {busy === 'send' ? 'Sending…' : 'Send outreach'}
              </button>
              <span className="text-violet-800">
                Sends from {emailFrom}. You can follow up in the same thread
                {repliesInApp ? ' and replies show up here.' : '.'}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {emailFrom === null && (
          <>
            <button
              type="button"
              onClick={() => void openEmail(mailtoLink(to.trim(), subject.trim(), text.trim()))}
              disabled={!toValid || busy !== null}
              title={toValid ? 'Opens your email app' : 'Enter an email address first'}
              className={cx(
                smallButton,
                emailFrom === null
                  ? 'bg-violet-600 text-white hover:bg-violet-700'
                  : 'bg-violet-50 text-violet-700 hover:bg-violet-100',
              )}
            >
              <Mail className="h-3.5 w-3.5" aria-hidden /> Open in email
            </button>
            <button
              type="button"
              onClick={() => void openEmail(gmailLink(to.trim(), subject.trim(), text.trim()))}
              disabled={!toValid || busy !== null}
              title={toValid ? 'Opens Gmail in a new tab' : 'Enter an email address first'}
              className={cx(smallButton, 'bg-violet-50 text-violet-700 hover:bg-violet-100')}
            >
              <Mail className="h-3.5 w-3.5" aria-hidden /> Open in Gmail
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => void copy()}
          className={cx(smallButton, 'text-slate-600 hover:bg-slate-100')}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => void run('save', () => api.saveDraft(signalId, changes))}
          disabled={!unsaved || busy !== null}
          title={unsaved ? 'You have changes that are not saved yet' : 'All changes saved'}
          className={cx(
            smallButton,
            unsaved
              ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100'
              : 'text-emerald-700 disabled:opacity-100',
          )}
        >
          {unsaved ? (
            <Save className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
          {busy === 'save' ? 'Saving…' : unsaved ? 'Save changes' : 'Saved'}
        </button>
        <button
          type="button"
          onClick={() => void run('draft', () => api.draftMessage(signalId, true))}
          disabled={busy !== null}
          className={cx(smallButton, 'text-slate-600 hover:bg-slate-100')}
        >
          <RefreshCw
            className={cx('h-3.5 w-3.5', busy === 'draft' && 'animate-spin')}
            aria-hidden
          />
          {busy === 'draft' ? 'Drafting…' : 'Start again'}
        </button>
      </div>

      {emailFrom === null && (
        <div
          className={cx(
            'flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs',
            opened ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600',
          )}
        >
          <span>
            {!toValid
              ? 'Enter the email address in To first, then:'
              : opened
                ? 'Sent it from your email?'
                : 'After you send it from your email:'}
          </span>
          <button
            type="button"
            onClick={() => void markSent()}
            disabled={!toValid || busy !== null}
            title={toValid ? 'Record that you sent it' : 'Enter an email address in To first'}
            className={cx(smallButton, 'bg-emerald-600 text-white hover:bg-emerald-700')}
          >
            <CircleCheck className="h-3.5 w-3.5" aria-hidden />
            {busy === 'sent' ? 'Saving…' : 'Mark as sent'}
          </button>
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        {SOURCE_LABEL[draft.source]} on {formatDate(draft.createdAt)}
        {draft.editedAt !== null && `, edited ${formatDate(draft.editedAt)}`}.{' '}
        {emailFrom === null
          ? 'The email is sent from your own mailbox, not from this app.'
          : `The email is sent from ${emailFrom} through SendGrid.`}
      </p>
      {error !== null && (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
