import {
  Airplane,
  Bicycle,
  Boat,
  Car,
  DeviceMobile,
  Dress,
  Farm,
  GameController,
  Hammer,
  House,
  Motorcycle,
  Package,
  SquaresFour,
  Tent,
  Truck,
  type IconProps,
} from "@phosphor-icons/react";

const categoryIcons = {
  "cars-trucks": Car,
  motorcycles: Motorcycle,
  "rvs-campers": Tent,
  powersports: Bicycle,
  "auto-parts": Package,
  trailers: Truck,
  furniture: House,
  electronics: DeviceMobile,
  "tools-equipment": Hammer,
  "outdoor-sporting": Tent,
  "farm-garden": Farm,
  general: SquaresFour,
  clothing: Dress,
  boats: Boat,
  travel: Airplane,
  toys: GameController,
} as const;

export type CategoryIconSlug = keyof typeof categoryIcons;

export function CategoryIcon({ slug, ...props }: { slug: string } & IconProps) {
  const Icon = categoryIcons[slug as CategoryIconSlug] ?? SquaresFour;
  return <Icon {...props} />;
}
