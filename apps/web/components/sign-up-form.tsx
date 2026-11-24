'use client';

import { useSignUp } from '@clerk/nextjs';
import { ArrowLeft, Check, CircleAlert, Eye, EyeOff, LoaderCircle, MailCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FcGoogle } from 'react-icons/fc';
import { useEffect, useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { HOME_PATH, SSO_CALLBACK_PATH } from '../lib/auth-routes';
import { PASSWORD_RULES, checkAll, checkField, passwordStrength } from '../lib/sign-up-validation';
import type { SignUpErrors, SignUpField, SignUpValues } from '../lib/sign-up-validation';
import { cx } from './ui';

const RESEND_WAIT_SECONDS = 30;
const EMPTY: SignUpValues = { firstName: '', lastName: '', email: '', password: '' };

/**
 * Our own sign-up: first name, last name, email and password, checked as you type, then a
 * 6-digit code sent to the email. Built on Clerk's sign-up API, so Clerk still enforces its
 * rules (unique email, breached passwords) and those errors appear under the right field.
 */
export function SignUpForm() {
  const { signUp, errors: clerkErrors, fetchStatus } = useSignUp();
  const router = useRouter();
  const [values, setValues] = useState<SignUpValues>(EMPTY);
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [touched, setTouched] = useState<Partial<Record<SignUpField, boolean>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [busy, setBusy] = useState(false);

  // Clerk's own field errors (e.g. "That email address is taken") shown under the field.
  const serverErrors: SignUpErrors = {
    firstName: clerkErrors.fields.firstName?.longMessage ?? clerkErrors.fields.firstName?.message,
    lastName: clerkErrors.fields.lastName?.longMessage ?? clerkErrors.fields.lastName?.message,
    email: clerkErrors.fields.emailAddress?.longMessage ?? clerkErrors.fields.emailAddress?.message,
    password: clerkErrors.fields.password?.longMessage ?? clerkErrors.fields.password?.message,
  };
  const errorFor = (field: SignUpField): string | undefined =>
    (touched[field] === true ? errors[field] : undefined) ?? serverErrors[field];

  const update = (field: SignUpField, value: string): void => {
    const next = { ...values, [field]: value };
    setValues(next);
    setFormError(null);
    // Once a field has been left, re-check it as the person corrects it.
    if (touched[field] === true) setErrors((e) => ({ ...e, [field]: checkField(field, next) }));
    if (field === 'email' && touched.password === true) {
      setErrors((e) => ({ ...e, password: checkField('password', next) }));
    }
  };

  const leave = (field: SignUpField): void => {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors((e) => ({ ...e, [field]: checkField(field, values) }));
  };
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const found = checkAll(values);
    setTouched({ firstName: true, lastName: true, email: true, password: true });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(`field-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const created = await signUp.password({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        emailAddress: values.email.trim().toLowerCase(),
        password: values.password,
      });
      if (created.error !== null) {
        setFormError(friendly(created.error.message));
        return;
      }
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error !== null) {
        setFormError(friendly(sent.error.message));
        return;
      }
      setStep('verify');
    } finally {
      setBusy(false);
    }
  };

  const google = async (): Promise<void> => {
    setFormError(null);
    const result = await signUp.sso({
      strategy: 'oauth_google',
      redirectUrl: HOME_PATH,
      redirectCallbackUrl: SSO_CALLBACK_PATH,
    });
    if (result.error !== null) setFormError(friendly(result.error.message));
  };

  const finish = async (): Promise<void> => {
    await signUp.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl(HOME_PATH);
        if (url.startsWith('http')) window.location.href = url;
        else router.push(url);
      },
    });
  };

  if (step === 'verify') {
    return (
      <VerifyEmail
        email={values.email.trim().toLowerCase()}
        onBack={() => setStep('details')}
        onVerify={async (code) => {
          const result = await signUp.verifications.verifyEmailCode({ code });
          if (result.error !== null) return friendly(result.error.message);
          if (signUp.status !== 'complete') {
            return 'Almost there, but Clerk needs more details. Check the sign-up settings in the Clerk dashboard.';
          }
          await finish();
          return null;
        }}
        onResend={async () => {
          const result = await signUp.verifications.sendEmailCode();
          return result.error === null ? null : friendly(result.error.message);
        }}
      />
    );
  }

  const strength = passwordStrength(values.password);
  const loading = busy || fetchStatus === 'fetching';

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="space-y-3.5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Create your account</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          It takes a minute. We&apos;ll email you a code.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void google()}
        className="flex h-10 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:bg-violet-50/60"
      >
        <FcGoogle className="h-4 w-4" aria-hidden /> Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> or{' '}
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" error={errorFor('firstName')} id="field-firstName">
          {(props) => (
            <input
              {...props}
              autoComplete="given-name"
              value={values.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              onBlur={() => leave('firstName')}
              placeholder="Jane"
            />
          )}
        </Field>
        <Field label="Last name" error={errorFor('lastName')} id="field-lastName">
          {(props) => (
            <input
              {...props}
              autoComplete="family-name"
              value={values.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              onBlur={() => leave('lastName')}
              placeholder="Citizen"
            />
          )}
        </Field>
      </div>

      <Field label="Work email" error={errorFor('email')} id="field-email">
        {(props) => (
          <input
            {...props}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => update('email', e.target.value)}
            onBlur={() => leave('email')}
            placeholder="name@company.com"
          />
        )}
      </Field>

      <PasswordField
        value={values.password}
        error={errorFor('password')}
        onChange={(v) => update('password', v)}
        onBlur={() => leave('password')}
      />

      {values.password !== '' && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1" aria-hidden>
            {[1, 2, 3, 4].map((level) => (
              <span
                key={level}
                className={cx(
                  'h-1 rounded-full transition-colors',
                  strength >= level
                    ? strength <= 1
                      ? 'bg-rose-400'
                      : strength === 2
                        ? 'bg-amber-400'
                        : 'bg-emerald-500'
                    : 'bg-slate-200',
                )}
              />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
            {PASSWORD_RULES.map((rule) => {
              const ok = rule.test(values.password, values.email);
              return (
                <li
                  key={rule.id}
                  className={cx(
                    'flex items-center gap-1.5 text-xs transition-colors',
                    ok ? 'text-emerald-700' : 'text-slate-400',
                  )}
                >
                  <Check className={cx('h-3 w-3', ok ? 'opacity-100' : 'opacity-30')} aria-hidden />
                  {rule.label}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {formError !== null && <FormAlert>{formError}</FormAlert>}

      {/* Clerk's bot protection draws its check here when needed. */}
      <div id="clerk-captcha" />

      <button
        type="submit"
        disabled={loading}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-violet-600 via-indigo-500 to-cyan-500 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 disabled:cursor-progress disabled:opacity-80"
      >
        {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
        {loading ? 'Creating your account…' : 'Create account'}
      </button>
    </form>
  );
}

/* ── Step 2: the emailed code ─────────────────────────────────────────────── */

function VerifyEmail({
  email,
  onVerify,
  onResend,
  onBack,
}: {
  email: string;
  onVerify: (code: string) => Promise<string | null>;
  onResend: () => Promise<string | null>;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT_SECONDS);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const verify = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setError(await onVerify(code));
    setBusy(false);
  };

  return (
    <form noValidate onSubmit={(e) => void verify(e)} className="animate-rise space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-violet-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Change details
      </button>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-violet-100">
          <MailCheck className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Check your email</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            We sent a 6-digit code to <span className="font-medium text-slate-700">{email}</span>.
          </p>
        </div>
      </div>

      <label className="block">
        <span className="sr-only">Verification code</span>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
            setError(null);
          }}
          placeholder="••••••"
          aria-invalid={error !== null}
          className={cx(
            'h-12 w-full rounded-xl border bg-white text-center font-mono text-2xl tracking-[0.5em] text-slate-900 transition outline-none focus:ring-4',
            error === null
              ? 'border-slate-200 focus:border-violet-400 focus:ring-violet-100'
              : 'border-rose-300 focus:border-rose-400 focus:ring-rose-100',
          )}
        />
      </label>

      {error !== null && <FormAlert>{error}</FormAlert>}
      {notice !== null && error === null && <p className="text-xs text-emerald-700">{notice}</p>}

      <button
        type="submit"
        disabled={busy}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-violet-600 via-indigo-500 to-cyan-500 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 disabled:cursor-progress disabled:opacity-80"
      >
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
        {busy ? 'Checking…' : 'Verify and continue'}
      </button>

      <p className="text-center text-xs text-slate-500">
        Didn&apos;t get it?{' '}
        <button
          type="button"
          disabled={wait > 0}
          onClick={() =>
            void onResend().then((problem) => {
              setError(problem);
              if (problem === null) {
                setNotice('A new code is on its way.');
                setWait(RESEND_WAIT_SECONDS);
              }
            })
          }
          className="font-semibold text-violet-700 hover:text-violet-800 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
        </button>
      </p>
    </form>
  );
}

/* ── Small pieces ──────────────────────────────────────────────────────────── */

const INPUT =
  'h-10 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition outline-none focus:ring-4';

function Field({
  label,
  error,
  id,
  children,
}: {
  label: string;
  error: string | undefined;
  id: string;
  children: (props: {
    id: string;
    className: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const errorId = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children({
        id,
        className: cx(
          INPUT,
          error === undefined
            ? 'border-slate-200 focus:border-violet-400 focus:ring-violet-100'
            : 'border-rose-300 focus:border-rose-400 focus:ring-rose-100',
        ),
        'aria-invalid': error !== undefined,
        'aria-describedby': error === undefined ? undefined : errorId,
      })}
      {error !== undefined && (
        <p id={errorId} className="animate-rise mt-1 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

function PasswordField({
  value,
  error,
  onChange,
  onBlur,
}: {
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const [shown, setShown] = useState(false);
  return (
    <Field label="Password" error={error} id="field-password">
      {(props) => (
        <div className="relative">
          <input
            {...props}
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder="Create a password"
            className={cx(props.className, 'pr-10')}
          />
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-700"
            aria-label={shown ? 'Hide password' : 'Show password'}
          >
            {shown ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      )}
    </Field>
  );
}

function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="animate-rise flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200"
    >
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Clerk messages are mostly fine; this fixes the ones that would confuse people. */
function friendly(message: string): string {
  if (/first_name|last_name/i.test(message) && /not a valid parameter|unknown/i.test(message)) {
    return 'Names are switched off for this app. Turn on "First and last name" in the Clerk dashboard (User & authentication).';
  }
  return message;
}
