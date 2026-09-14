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

const categoryArtwork = {
  "cars-trucks": { src: "/category-icons/cars-trucks.png", alt: "Dimensional teal pickup truck illustration" },
  motorcycles: { src: "/category-icons/motorcycles.png", alt: "Dimensional navy motorcycle illustration" },
  "rvs-campers": { src: "/category-icons/rvs-campers.png", alt: "Dimensional cream travel trailer illustration" },
  powersports: { src: "/category-icons/powersports.png", alt: "Dimensional teal all-terrain vehicle illustration" },
  "auto-parts": { src: "/category-icons/auto-parts.png", alt: "Dimensional wheel and toolbox illustration" },
  trailers: { src: "/category-icons/trailers.png", alt: "Dimensional teal utility trailer illustration" },
  furniture: { src: "/category-icons/furniture.png", alt: "Dimensional teal lounge chair illustration" },
  electronics: { src: "/category-icons/electronics.png", alt: "Dimensional smartphone and headphones illustration" },
  "tools-equipment": { src: "/category-icons/tools-equipment.png", alt: "Dimensional toolbox and drill illustration" },
  "outdoor-sporting": { src: "/category-icons/outdoor-sporting.png", alt: "Dimensional camping tent and lantern illustration" },
  "farm-garden": { src: "/category-icons/farm-garden.png", alt: "Dimensional garden wheelbarrow illustration" },
  general: { src: "/category-icons/general.png", alt: "Dimensional shipping boxes and household goods illustration" },
} as const;

export type CategoryIconSlug = keyof typeof categoryIcons;
export type CategoryArtworkSlug = keyof typeof categoryArtwork;

export function CategoryIcon({ slug, ...props }: { slug: string } & IconProps) {
  const Icon = categoryIcons[slug as CategoryIconSlug] ?? SquaresFour;
  return <Icon {...props} />;
}

export function CategoryArtwork({
  slug,
  size = 72,
  className,
}: {
  slug: string;
  size?: number;
  className?: string;
}) {
  const artwork = categoryArtwork[slug as CategoryArtworkSlug];
  if (!artwork) return <CategoryIcon slug={slug} size={Math.round(size * 0.6)} weight="duotone" />;

  return (
    <img
      src={artwork.src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="eager"
      className={`category-art h-auto w-auto object-contain ${className ?? ""}`}
    />
  );
}
