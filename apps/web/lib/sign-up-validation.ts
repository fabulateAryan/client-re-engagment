/** Sign-up form rules, checked in the browser before anything is sent to Clerk. */

export interface SignUpValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export type SignUpField = keyof SignUpValues;
export type SignUpErrors = Partial<Record<SignUpField, string>>;

const NAME_MAX = 50;
/** Letters (any language), spaces, apostrophes, hyphens and full stops: "Mary-Jane O'Neil Jr." */
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
/** A practical email check: something@domain.tld, no spaces. Clerk checks it properly too. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

/** Password rules shown as a live checklist. */
export const PASSWORD_RULES: {
  id: string;
  label: string;
  test: (p: string, email: string) => boolean;
}[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN} characters`,
    test: (p) => p.length >= PASSWORD_MIN,
  },
  { id: 'letter', label: 'A letter', test: (p) => /\p{L}/u.test(p) },
  { id: 'number', label: 'A number', test: (p) => /\d/.test(p) },
  {
    id: 'email',
    label: 'Not based on your email',
    test: (p, email) => p !== '' && !containsEmailName(p, email),
  },
];

/** True when the password contains the part of the email before the @ (3+ characters). */
function containsEmailName(password: string, email: string): boolean {
  const name = email.trim().toLowerCase().split('@')[0] ?? '';
  return name.length >= 3 && password.toLowerCase().includes(name);
}

function checkName(value: string, label: string): string | undefined {
  const name = value.trim();
  if (name === '') return `Enter your ${label}.`;
  if (name.length > NAME_MAX) return `Keep your ${label} under ${NAME_MAX} characters.`;
  if (!NAME_PATTERN.test(name)) return `Use letters only in your ${label}.`;
  return undefined;
}

export function checkField(field: SignUpField, values: SignUpValues): string | undefined {
  switch (field) {
    case 'firstName':
      return checkName(values.firstName, 'first name');
    case 'lastName':
      return checkName(values.lastName, 'last name');
    case 'email': {
      const email = values.email.trim();
      if (email === '') return 'Enter your email address.';
      if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address, like name@company.com.';
      return undefined;
    }
    case 'password': {
      const p = values.password;
      if (p === '') return 'Create a password.';
      if (p.length > PASSWORD_MAX) return `Keep your password under ${PASSWORD_MAX} characters.`;
      const failed = PASSWORD_RULES.find((rule) => !rule.test(p, values.email));
      return failed === undefined ? undefined : `Password needs: ${failed.label.toLowerCase()}.`;
    }
  }
}

export function checkAll(values: SignUpValues): SignUpErrors {
  const errors: SignUpErrors = {};
  for (const field of ['firstName', 'lastName', 'email', 'password'] as const) {
    const message = checkField(field, values);
    if (message !== undefined) errors[field] = message;
  }
  return errors;
}

/** How strong the password looks, 0 to 4, for the strength bar. */
export function passwordStrength(password: string): number {
  if (password === '') return 0;
  let score = 0;
  if (password.length >= PASSWORD_MIN) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^\p{L}\d]/u.test(password)) score += 1;
  return score;
}
