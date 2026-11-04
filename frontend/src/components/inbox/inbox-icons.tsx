"use client";

import { MagnifyingGlassIcon, FunnelIcon, ArrowsClockwiseIcon, InfoIcon, XIcon, ArrowLeftIcon, ArrowDownIcon, PaperPlaneTiltIcon, FileTextIcon, StarIcon, TagIcon, DotsThreeIcon, UserIcon, CheckIcon, CheckCircleIcon, ClockIcon, EnvelopeIcon, SmileyIcon, LightningIcon, BracketsCurlyIcon, PlusIcon, PaperclipIcon, SparkleIcon, CopyIcon, CalendarBlankIcon, ChatsCircleIcon, CaretDownIcon, ChecksIcon, QuestionIcon, BellIcon, ListIcon, type Icon } from "@phosphor-icons/react";
import { SiWhatsapp, SiInstagram, SiGmail, SiMessenger } from "@icons-pack/react-simple-icons";

const icons = {
  search: MagnifyingGlassIcon, filter: FunnelIcon, refresh: ArrowsClockwiseIcon, info: InfoIcon,
  close: XIcon, back: ArrowLeftIcon, down: ArrowDownIcon, send: PaperPlaneTiltIcon, template: FileTextIcon,
  star: StarIcon, tag: TagIcon, more: DotsThreeIcon, user: UserIcon, check: CheckCircleIcon,
  clock: ClockIcon, mail: EnvelopeIcon, smile: SmileyIcon, lightning: LightningIcon,
  variable: BracketsCurlyIcon, plus: PlusIcon, attachment: PaperclipIcon, sparkle: SparkleIcon,
  copy: CopyIcon, note: CalendarBlankIcon, history: ChatsCircleIcon, chevron: CaretDownIcon,
  checks: ChecksIcon, tick: CheckIcon, help: QuestionIcon, bell: BellIcon, menu: ListIcon,
} satisfies Record<string, Icon>;

export type InboxIconName = keyof typeof icons;
export function InboxIcon({ name, filled = false }: { name: InboxIconName; filled?: boolean }) {
  const Glyph = icons[name];
  return <Glyph size={20} weight={filled ? "fill" : "regular"} aria-hidden="true" />;
}

export function ChannelBadge({ type, size = 17 }: { type: string; size?: number }) {
  if (type === "whatsapp") return <SiWhatsapp size={size} color="#18bf42" aria-hidden="true" />;
  if (type === "instagram") return <SiInstagram size={size} color="#e62a91" aria-hidden="true" />;
  if (type === "facebook") return <SiMessenger size={size} color="#087dff" aria-hidden="true" />;
  if (type === "email") return <SiGmail size={size} color="#ea4335" aria-hidden="true" />;
  return <ChatsCircleIcon size={size} color="#5d34ef" aria-hidden="true" />;
}
