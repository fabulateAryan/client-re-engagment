import type { Metadata } from 'next';
import { connection } from 'next/server';
import { OutreachList } from '../../../components/outreach-list';
import { ApiErrorPanel, PageHeader } from '../../../components/ui';
import { api, attempt } from '../../../lib/api-server';

export const metadata: Metadata = { title: 'Outreach' };

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { open } = await searchParams;
  const [loaded, status] = await Promise.all([
    attempt(() => api.outreach()),
    attempt(() => api.emailStatus()),
  ]);
  const repliesInApp = status.ok && status.data.enabled && status.data.repliesInApp === true;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Outreach"
        title="Email threads"
        description="Every outreach email sent from the app, with follow-ups and replies. Open a thread to read replies or send a follow-up."
      />
      {loaded.ok ? (
        <OutreachList
          initial={loaded.data.items}
          repliesInApp={repliesInApp}
          initialOpen={typeof open === 'string' ? open : null}
        />
      ) : (
        <ApiErrorPanel message={loaded.error} />
      )}
    </div>
  );
}
