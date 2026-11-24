import type { EngagementMetric, PlatformValue, SignalTypeValue } from '@signal-monitoring/shared';
import {
  Bookmark,
  CalendarHeart,
  Eye,
  Globe,
  Handshake,
  FileText,
  Heart,
  Megaphone,
  MessageCircle,
  Share2,
  PackageOpen,
  Rocket,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { FaInstagram, FaLinkedinIn, FaRegNewspaper, FaTiktok, FaYoutube } from 'react-icons/fa6';

/** Any icon component (lucide or react-icons) that takes a className. */
export type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

export interface PlatformMeta {
  label: string;
  /** The platform's own logo (react-icons, Font Awesome brands). */
  icon: IconComponent;
  /** Tailwind classes for a tinted chip. */
  chip: string;
  /** Solid colour class for bars and dots. */
  bar: string;
  /** Background for a solid logo tile (brand colour or gradient). */
  tile: string;
  /** Soft coloured glow under a logo tile. */
  glow: string;
  /** Extra classes for the logo glyph on a tile. */
  iconClass?: string;
}

export const PLATFORMS: Record<PlatformValue, PlatformMeta> = {
  LINKEDIN: {
    label: 'LinkedIn',
    icon: FaLinkedinIn,
    chip: 'bg-linkedin/10 text-linkedin ring-linkedin/25',
    bar: 'bg-linkedin',
    tile: 'bg-linkedin',
    glow: 'shadow-linkedin/30',
  },
  INSTAGRAM: {
    label: 'Instagram',
    icon: FaInstagram,
    chip: 'bg-instagram/10 text-instagram ring-instagram/25',
    bar: 'bg-linear-to-r from-[#feda75] via-[#d62976] to-[#4f5bd5]',
    tile: 'bg-linear-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5]',
    glow: 'shadow-instagram/30',
  },
  TIKTOK: {
    label: 'TikTok',
    icon: FaTiktok,
    chip: 'bg-tiktok/10 text-tiktok ring-tiktok/25',
    bar: 'bg-tiktok',
    tile: 'bg-tiktok',
    glow: 'shadow-tiktok/30',
    // TikTok's logo carries a cyan and pink offset edge.
    iconClass: '[filter:drop-shadow(-1px_-1px_0_#25f4ee)_drop-shadow(1px_1px_0_#fe2c55)]',
  },
  YOUTUBE: {
    label: 'YouTube',
    icon: FaYoutube,
    chip: 'bg-youtube/10 text-youtube ring-youtube/25',
    bar: 'bg-youtube',
    tile: 'bg-[#ff0000]',
    glow: 'shadow-youtube/30',
  },
  GOOGLE_RSS: {
    // Platform id stays GOOGLE_RSS in the API; it carries company news articles.
    label: 'News',
    icon: FaRegNewspaper,
    chip: 'bg-rss/10 text-rss ring-rss/25',
    bar: 'bg-rss',
    tile: 'bg-linear-to-br from-orange-500 to-rss',
    glow: 'shadow-rss/30',
  },
};

export const PLATFORM_ORDER: PlatformValue[] = [
  'LINKEDIN',
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'GOOGLE_RSS',
];

/** Engagement counts, in display order. */
export const ENGAGEMENT_METRICS: { key: EngagementMetric; label: string; icon: LucideIcon }[] = [
  { key: 'views', label: 'views', icon: Eye },
  { key: 'likes', label: 'likes', icon: Heart },
  { key: 'comments', label: 'comments', icon: MessageCircle },
  { key: 'shares', label: 'shares', icon: Share2 },
  { key: 'saves', label: 'saves', icon: Bookmark },
];

export interface SignalTypeMeta {
  label: string;
  icon: LucideIcon;
  chip: string;
  bar: string;
}

export const SIGNAL_TYPES: Record<SignalTypeValue, SignalTypeMeta> = {
  CAMPAIGN_LAUNCH: {
    label: 'Campaign',
    icon: Rocket,
    chip: 'bg-violet-50 text-violet-700 ring-violet-200',
    bar: 'bg-violet-500',
  },
  PRODUCT_LAUNCH: {
    label: 'Product launch',
    icon: PackageOpen,
    chip: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
    bar: 'bg-cyan-500',
  },
  CREATOR_CONTENT: {
    label: 'Creator activity',
    icon: Users,
    chip: 'bg-pink-50 text-pink-700 ring-pink-200',
    bar: 'bg-pink-500',
  },
  MARKET_EXPANSION: {
    label: 'Market expansion',
    icon: Globe,
    chip: 'bg-teal-50 text-teal-700 ring-teal-200',
    bar: 'bg-teal-500',
  },
  SEASONAL: {
    label: 'Seasonal',
    icon: CalendarHeart,
    chip: 'bg-orange-50 text-orange-700 ring-orange-200',
    bar: 'bg-orange-500',
  },
  EVENT_PARTNERSHIP: {
    label: 'Event or partnership',
    icon: Handshake,
    chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    bar: 'bg-indigo-500',
  },
  HIRING: {
    label: 'Hiring',
    icon: UserPlus,
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    bar: 'bg-emerald-500',
  },
  JOB_CHANGE: {
    label: 'Job change',
    icon: UserCheck,
    chip: 'bg-sky-50 text-sky-700 ring-sky-200',
    bar: 'bg-sky-500',
  },
  COMPANY_ANNOUNCEMENT: {
    label: 'Announcement',
    icon: Megaphone,
    chip: 'bg-amber-50 text-amber-700 ring-amber-200',
    bar: 'bg-amber-500',
  },
  NEW_POST: {
    label: 'New post',
    icon: FileText,
    chip: 'bg-slate-100 text-slate-700 ring-slate-200',
    bar: 'bg-slate-400',
  },
  OTHER: {
    label: 'Other',
    icon: Sparkles,
    chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
    bar: 'bg-fuchsia-500',
  },
};

export const SIGNAL_TYPE_ORDER: SignalTypeValue[] = [
  'PRODUCT_LAUNCH',
  'CAMPAIGN_LAUNCH',
  'CREATOR_CONTENT',
  'MARKET_EXPANSION',
  'SEASONAL',
  'EVENT_PARTNERSHIP',
  'HIRING',
  'JOB_CHANGE',
  'COMPANY_ANNOUNCEMENT',
  'NEW_POST',
  'OTHER',
];

/** Brand activity that can be a signal (ENG-231 section 6), shown on the overview. */
export const REENGAGEMENT_SIGNAL_TYPES: SignalTypeValue[] = [
  'PRODUCT_LAUNCH',
  'CAMPAIGN_LAUNCH',
  'CREATOR_CONTENT',
  'MARKET_EXPANSION',
  'SEASONAL',
  'EVENT_PARTNERSHIP',
];

export function isPlatform(value: string | undefined): value is PlatformValue {
  return value !== undefined && value in PLATFORMS;
}

export function isSignalType(value: string | undefined): value is SignalTypeValue {
  return value !== undefined && value in SIGNAL_TYPES;
}
