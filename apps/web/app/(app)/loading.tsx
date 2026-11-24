import {
  HeaderSkeleton,
  ListPanelSkeleton,
  NoteSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
} from '../../components/skeletons';

/** Overview while it loads: header, run health, note, four figures, the contact list and the side panels. */
export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton withAction />
      <NoteSkeleton />
      <NoteSkeleton />
      <StatCardsSkeleton />
      <div className="grid gap-4 lg:grid-cols-5">
        <ListPanelSkeleton rows={4} className="lg:col-span-3" />
        <div className="space-y-4 lg:col-span-2">
          <ListPanelSkeleton rows={3} />
          <ListPanelSkeleton rows={2} />
          <ListPanelSkeleton rows={2} />
        </div>
      </div>
    </PageSkeleton>
  );
}
