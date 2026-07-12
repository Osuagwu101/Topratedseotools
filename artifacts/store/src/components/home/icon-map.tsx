import {
  ShieldCheck,
  Zap,
  Clock,
  HeartHandshake,
  Wallet,
  Users,
  MousePointerClick,
  CreditCard,
  CheckCircle2,
  Sparkles,
  Lock,
  Headset,
  BadgeCheck,
  Rocket,
  type LucideIcon,
} from "lucide-react";

export const HOME_ICONS: Record<string, LucideIcon> = {
  ShieldCheck,
  Zap,
  Clock,
  HeartHandshake,
  Wallet,
  Users,
  MousePointerClick,
  CreditCard,
  CheckCircle2,
  Sparkles,
  Lock,
  Headset,
  BadgeCheck,
  Rocket,
};

export const HOME_ICON_NAMES = Object.keys(HOME_ICONS);

export function getHomeIcon(name: string | null | undefined): LucideIcon {
  return (name && HOME_ICONS[name]) || ShieldCheck;
}
