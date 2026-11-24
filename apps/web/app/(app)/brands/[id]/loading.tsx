import {
  HeaderSkeleton,
  ListPanelSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
} from '../../../../components/skeletons';

/** One brand's page while it loads. */
export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton withAction />
      <StatCardsSkeleton />
      <div className="grid gap-4 lg:grid-cols-5">
        <ListPanelSkeleton rows={4} className="lg:col-span-3" />
        <ListPanelSkeleton rows={3} className="lg:col-span-2" />
      </div>
    </PageSkeleton>
  );
}
