import {
  Airplane,
  ArrowsLeftRight,
  Baby,
  Bicycle,
  Boat,
  BookOpenText,
  Buildings,
  Briefcase,
  Car,
  Cow,
  DeviceMobile,
  DesktopTower,
  Dress,
  Farm,
  Fish,
  GameController,
  Gift,
  Guitar,
  Heart,
  Hammer,
  House,
  Megaphone,
  Motorcycle,
  Oven,
  Package,
  PawPrint,
  PersonSimpleRun,
  Snowflake,
  SquaresFour,
  Tent,
  Ticket,
  TShirt,
  Tree,
  Truck,
  type IconProps,
  Wrench,
  Waves,
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
  announcements: Megaphone,
  appliances: Oven,
  baby: Baby,
  "books-media": BookOpenText,
  "clothing-apparel": TShirt,
  computers: DesktopTower,
  cycling: Bicycle,
  "fitness-equipment": PersonSimpleRun,
  "for-trade-barter": ArrowsLeftRight,
  free: Gift,
  "home-garden": Tree,
  "hunting-fishing": Fish,
  industrial: Buildings,
  jobs: Briefcase,
  livestock: Cow,
  "musical-instruments": Guitar,
  "other-real-estate": Buildings,
  pets: PawPrint,
  services: Wrench,
  tickets: Ticket,
  toys: GameController,
  "water-sports": Waves,
  weddings: Heart,
  "winter-sports": Snowflake,
  clothing: Dress,
  boats: Boat,
  travel: Airplane,
} as const;

const categoryArtwork = {
  "cars-trucks": {
    src: "/category-icons/cars-trucks.png",
    alt: "Dimensional teal pickup truck illustration",
  },
  motorcycles: {
    src: "/category-icons/motorcycles.png",
    alt: "Dimensional navy motorcycle illustration",
  },
  "rvs-campers": {
    src: "/category-icons/rvs-campers.png",
    alt: "Dimensional cream travel trailer illustration",
  },
  powersports: {
    src: "/category-icons/powersports.png",
    alt: "Dimensional teal all-terrain vehicle illustration",
  },
  "auto-parts": {
    src: "/category-icons/auto-parts.png",
    alt: "Dimensional tire and rim illustration",
  },
  trailers: {
    src: "/category-icons/trailers.png",
    alt: "Dimensional teal utility trailer illustration",
  },
  furniture: {
    src: "/category-icons/furniture.png",
    alt: "Dimensional teal lounge chair illustration",
  },
  "apparel-accessories": {
    src: "/category-icons/apparel-accessories.png",
    alt: "Dimensional jean jacket illustration",
  },
  "baby-kids": {
    src: "/category-icons/baby-kids.png",
    alt: "Dimensional toy illustration",
  },
  electronics: {
    src: "/category-icons/electronics.png",
    alt: "Dimensional smartphone illustration",
  },
  "tools-equipment": {
    src: "/category-icons/tools-equipment.png",
    alt: "Dimensional drill illustration",
  },
  "outdoor-sporting": {
    src: "/category-icons/outdoor-sporting.png",
    alt: "Dimensional camping tent illustration",
  },
  "farm-garden": {
    src: "/category-icons/farm-garden.png",
    alt: "Dimensional garden wheelbarrow illustration",
  },
  general: {
    src: "/category-icons/general.png",
    alt: "Dimensional shipping boxes and household goods illustration",
  },
  announcements: {
    src: "/category-icons/announcements.png",
    alt: "Dimensional navy and cream megaphone illustration",
  },
  appliances: {
    src: "/category-icons/appliances.png",
    alt: "Dimensional countertop oven illustration",
  },
  collectibles: {
    src: "/category-icons/collectibles.png",
    alt: "Dimensional coin in a glass case illustration",
  },
  "crafts-hobbies": {
    src: "/category-icons/crafts-hobbies.png",
    alt: "Dimensional yarn ball illustration",
  },
  "health-beauty": {
    src: "/category-icons/health-beauty.png",
    alt: "Dimensional beauty tub with a green leaf illustration",
  },
  baby: {
    src: "/category-icons/baby.png",
    alt: "Dimensional modern baby stroller illustration",
  },
  "books-media": {
    src: "/category-icons/books-media.png",
    alt: "Dimensional books and vinyl record illustration",
  },
  "clothing-apparel": {
    src: "/category-icons/clothing-apparel.png",
    alt: "Dimensional folded cream sweater illustration",
  },
  computers: {
    src: "/category-icons/computers.png",
    alt: "Dimensional laptop illustration",
  },
  cycling: {
    src: "/category-icons/cycling.png",
    alt: "Dimensional teal bicycle illustration",
  },
  "fitness-equipment": {
    src: "/category-icons/fitness-equipment.png",
    alt: "Dimensional navy and amber dumbbell illustration",
  },
  "for-trade-barter": {
    src: "/category-icons/for-trade-barter.png",
    alt: "Dimensional navy and amber exchange arrows illustration",
  },
  free: {
    src: "/category-icons/free.png",
    alt: "Dimensional cream gift box illustration",
  },
  "home-garden": {
    src: "/category-icons/home-garden.png",
    alt: "Dimensional leafy houseplant illustration",
  },
  "hunting-fishing": {
    src: "/category-icons/hunting-fishing.png",
    alt: "Dimensional teal fishing rod and lure illustration",
  },
  industrial: {
    src: "/category-icons/industrial.png",
    alt: "Dimensional yellow forklift illustration",
  },
  "jewelry-watches": {
    src: "/category-icons/jewelry-watches.png",
    alt: "Dimensional necklace on a display illustration",
  },
  jobs: {
    src: "/category-icons/jobs.png",
    alt: "Dimensional navy briefcase illustration",
  },
  livestock: {
    src: "/category-icons/livestock.png",
    alt: "Dimensional cream and brown cow illustration",
  },
  "musical-instruments": {
    src: "/category-icons/musical-instruments.png",
    alt: "Dimensional teal acoustic guitar illustration",
  },
  "other-real-estate": {
    src: "/category-icons/other-real-estate.png",
    alt: "Dimensional house and for-sale sign illustration",
  },
  "office-business": {
    src: "/category-icons/office-business.png",
    alt: "Dimensional office organizer with plant and supplies illustration",
  },
  pets: {
    src: "/category-icons/pets.png",
    alt: "Dimensional golden retriever puppy illustration",
  },
  services: {
    src: "/category-icons/services.png",
    alt: "Dimensional navy and amber adjustable wrench illustration",
  },
  "tickets-events": {
    src: "/category-icons/tickets-events.png",
    alt: "Dimensional event ticket illustration",
  },
  tickets: {
    src: "/category-icons/tickets.png",
    alt: "Dimensional cream event tickets illustration",
  },
  toys: {
    src: "/category-icons/toys.png",
    alt: "Dimensional teddy bear illustration",
  },
  "water-sports": {
    src: "/category-icons/water-sports.png",
    alt: "Dimensional teal kayak and paddle illustration",
  },
  weddings: {
    src: "/category-icons/weddings.png",
    alt: "Dimensional wedding ring box illustration",
  },
  "winter-sports": {
    src: "/category-icons/winter-sports.png",
    alt: "Dimensional crossed teal skis illustration",
  },
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
      // Keep the requested artwork size authoritative. The previous `w-auto`
      // / `h-auto` rules allowed the source image's intrinsic dimensions to
      // escape into compact cards and the mobile header menu.
      style={{ width: size, height: size }}
      className={`category-art max-w-full object-contain ${className ?? ""}`}
    />
  );
}
