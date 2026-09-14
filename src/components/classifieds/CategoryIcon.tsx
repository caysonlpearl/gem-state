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
  "cars-trucks": { src: "/category-icons/cars-trucks.jpg", alt: "Dimensional teal pickup truck illustration" },
  motorcycles: { src: "/category-icons/motorcycles.jpg", alt: "Dimensional navy motorcycle illustration" },
  "rvs-campers": { src: "/category-icons/rvs-campers.jpg", alt: "Dimensional cream travel trailer illustration" },
  powersports: { src: "/category-icons/powersports.jpg", alt: "Dimensional teal all-terrain vehicle illustration" },
  "auto-parts": { src: "/category-icons/auto-parts.jpg", alt: "Dimensional wheel and toolbox illustration" },
  trailers: { src: "/category-icons/trailers.jpg", alt: "Dimensional teal utility trailer illustration" },
  furniture: { src: "/category-icons/furniture.jpg", alt: "Dimensional teal lounge chair illustration" },
  electronics: { src: "/category-icons/electronics.jpg", alt: "Dimensional smartphone and headphones illustration" },
  "tools-equipment": { src: "/category-icons/tools-equipment.jpg", alt: "Dimensional toolbox and drill illustration" },
  "outdoor-sporting": { src: "/category-icons/outdoor-sporting.jpg", alt: "Dimensional camping tent and lantern illustration" },
  "farm-garden": { src: "/category-icons/farm-garden.jpg", alt: "Dimensional garden wheelbarrow illustration" },
  general: { src: "/category-icons/general.jpg", alt: "Dimensional shipping boxes and household goods illustration" },
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
      loading="lazy"
      className={`category-art h-auto w-auto object-contain ${className ?? ""}`}
    />
  );
}
