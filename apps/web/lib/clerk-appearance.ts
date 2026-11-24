import { APP_NAME } from './app-name';

/**
 * Makes Clerk's sign-in, sign-up and user menu match the app: violet primary, rounded
 * corners, Geist font. Passed to ClerkProvider so every Clerk component picks it up.
 *
 * `cssLayerName` puts Clerk's styles in the "clerk" CSS layer, which globals.css orders
 * before Tailwind's utilities, so the classes below win over Clerk's defaults.
 * Colour variables are given under both the current and the older names Clerk uses.
 */
export const clerkAppearance = {
  cssLayerName: 'clerk',
  variables: {
    colorPrimary: '#7c3aed',
    colorDanger: '#be123c',
    colorSuccess: '#047857',
    colorForeground: '#0f172a',
    colorMutedForeground: '#64748b',
    colorInput: '#ffffff',
    colorInputForeground: '#0f172a',
    colorText: '#0f172a',
    colorTextSecondary: '#64748b',
    colorBackground: '#ffffff',
    colorInputBackground: '#ffffff',
    colorInputText: '#0f172a',
    borderRadius: '0.75rem',
    fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    fontSize: '0.9rem',
  },
  elements: {
    headerTitle: 'text-xl font-semibold tracking-tight text-slate-900',
    headerSubtitle: 'text-sm text-slate-500',
    socialButtonsBlockButton:
      'h-10 rounded-xl border border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/60 transition',
    socialButtonsBlockButtonText: 'font-medium text-slate-700',
    dividerLine: 'bg-slate-200',
    dividerText: 'text-xs text-slate-400',
    formFieldLabel: 'text-sm font-medium text-slate-700',
    formFieldRow: 'gap-1!',
    form: 'gap-4!',
    main: 'gap-4!',
    formFieldInput:
      'h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-slate-900 transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100',
    formButtonPrimary:
      'h-10 rounded-xl bg-linear-to-r from-violet-600 via-indigo-500 to-cyan-500 text-sm font-semibold normal-case shadow-lg shadow-violet-500/25 transition hover:brightness-110',
    footerActionText: 'text-slate-500',
    footerActionLink: 'font-semibold text-violet-700 hover:text-violet-800',
    identityPreview: 'rounded-xl border-slate-200',
    otpCodeFieldInput: 'rounded-lg border-slate-300',
  },
};

/**
 * Only for the sign-in page: our page supplies the card, so Clerk's own card is flattened
 * into it and allowed to shrink on small phones. Kept off the global appearance so it does
 * not stretch or flatten other Clerk parts (account modal, menus).
 */
export const signInAppearance = {
  elements: {
    rootBox: 'w-full! max-w-full! min-w-0!',
    cardBox: 'w-full! max-w-full! min-w-0! shadow-none! border-0! rounded-none! bg-transparent!',
    card: 'w-full! max-w-full! min-w-0! shadow-none! border-0! bg-transparent! p-0! gap-4!',
    header: 'items-start! text-left!',
    footer: 'bg-none! bg-transparent! [&>div]:bg-transparent!',
    // Our Sign in / Create account switch above the form does this job.
    footerAction: 'hidden!',
  },
};

/** Our wording for Clerk's sign-in screen (instead of the app name set in the dashboard). */
export const clerkLocalization = {
  signIn: {
    start: {
      title: 'Welcome back',
      subtitle: `Sign in to ${APP_NAME}`,
      actionText: 'New here?',
      actionLink: 'Create an account',
    },
  },
};
