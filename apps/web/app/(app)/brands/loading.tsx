import {
  BrandGridSkeleton,
  BrandToolbarSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  SourceStripSkeleton,
} from '../../../components/skeletons';

/** Brands while they load: header, platform tiles, toolbar and a grid of brand cards. */
export default function Loading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <SourceStripSkeleton />
      <BrandToolbarSkeleton />
      <BrandGridSkeleton cards={6} />
    </PageSkeleton>
  );
}
