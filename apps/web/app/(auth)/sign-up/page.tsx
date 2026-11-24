import type { Metadata } from 'next';
import { SignUpForm } from '../../../components/sign-up-form';

export const metadata: Metadata = { title: 'Create account' };

/** Our own form (first name, last name, email, password), built on Clerk's sign-up API. */
export default function SignUpPage() {
  return <SignUpForm />;
}
