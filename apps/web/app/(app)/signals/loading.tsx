import {
  FilterBarSkeleton,
  HeaderSkeleton,
  NoteSkeleton,
  PageSkeleton,
  SignalGridSkeleton,
} from '../../../components/skeletons';

/** Signals while they load: header, note, filters and a grid of cards. */
export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <NoteSkeleton />
      <FilterBarSkeleton />
      <SignalGridSkeleton cards={6} />
    </PageSkeleton>
  );
}
