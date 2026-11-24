import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-medium text-violet-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <Link
        href="/"
        className="mt-6 inline-block text-sm text-slate-700 underline-offset-4 hover:underline"
      >
        Back to overview
      </Link>
    </div>
  );
}
