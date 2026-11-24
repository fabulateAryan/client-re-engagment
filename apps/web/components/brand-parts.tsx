import type { CampaignResponse } from '@signal-monitoring/shared';
import { ExternalLink, Megaphone } from 'lucide-react';
import { formatDate, timeAgo } from '../lib/format';

/** A clickable link for account handles; plain text for news search terms. */
export function HandleText({ value }: { value: string }) {
  const isLink = /^https?:\/\//i.test(value);
  const display = value.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  if (!isLink) {
    return <span className="block truncate text-sm font-medium text-slate-800">{display}</span>;
  }
  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 truncate text-sm font-medium text-slate-800 hover:text-violet-700"
    >
      <span className="truncate">{display}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
    </a>
  );
}

/** Status of one channel on a brand card. */
export function ChannelStatus({ off, checked }: { off: boolean; checked: string | undefined }) {
  if (off) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        Source off
      </span>
    );
  }
  if (checked === undefined) {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 ring-inset">
        Not checked
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 ring-inset">
      {timeAgo(checked)}
    </span>
  );
}

function campaignDates(campaign: CampaignResponse): string | null {
  const { startDate, endDate } = campaign;
  if (startDate !== null && endDate !== null) {
    return `${formatDate(startDate)} to ${formatDate(endDate)}`;
  }
  if (startDate !== null) return `From ${formatDate(startDate)}`;
  if (endDate !== null) return `Ended ${formatDate(endDate)}`;
  return null;
}

export function CampaignList({ campaigns }: { campaigns: CampaignResponse[] }) {
  if (campaigns.length === 0) return null;
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="text-[11px] font-medium tracking-[0.14em] text-slate-400 uppercase">
        Campaigns with us
      </p>
      <ul className="mt-2 space-y-2">
        {campaigns.map((campaign) => {
          const dates = campaignDates(campaign);
          return (
            <li key={campaign.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700 ring-1 ring-violet-100">
                <Megaphone className="h-3.5 w-3.5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {campaign.name}
                  {campaign.tags.map((tag) => (
                    <span
                      key={tag}
                      className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                    >
                      {tag}
                    </span>
                  ))}
                </p>
                <p className="text-xs text-slate-500">{dates ?? 'Dates not recorded'}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
