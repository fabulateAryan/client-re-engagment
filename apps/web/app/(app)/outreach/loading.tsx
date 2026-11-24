import { HeaderSkeleton, PageSkeleton, RunListSkeleton } from '../../../components/skeletons';

/** Outreach threads while they load. */
export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <RunListSkeleton rows={4} />
    </PageSkeleton>
  );
}
