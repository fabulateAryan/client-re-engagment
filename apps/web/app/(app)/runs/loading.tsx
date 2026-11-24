import { HeaderSkeleton, PageSkeleton, RunListSkeleton } from '../../../components/skeletons';

/** Runs while they load: header and a list of runs. */
export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <RunListSkeleton rows={5} />
    </PageSkeleton>
  );
}
