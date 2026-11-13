export function CreateListingHeader({ showPromotions = true }: { showPromotions?: boolean }) {
  return (
    <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
          Bluebird seller center
        </p>
        <h1 className="mt-1 font-editorial text-[40px] font-normal tracking-[-0.04em]">
          Create a listing
        </h1>
        <p className="mt-1 max-w-[680px] text-[12.5px] leading-relaxed text-muted-foreground">
          Every listing is free. List one exact item, vehicle, home, job, or service with your own
          photos, price, location, and details.
          {showPromotions &&
            " Optional Boosted and Featured placement is available after approval."}
        </p>
      </div>
    </div>
  );
}
