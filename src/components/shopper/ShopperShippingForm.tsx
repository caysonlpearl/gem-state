import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { sellerShippingMethods } from "@/config/shipping";
import {
  getShopperShipping,
  saveShopperShipping,
  type ShopperShipping,
} from "@/lib/shopper-shipping.functions";

const empty: ShopperShipping = {
  ship_from_name: "",
  ship_from_phone: "",
  ship_from_line1: "",
  ship_from_line2: "",
  ship_from_city: "",
  ship_from_region: "",
  ship_from_postal_code: "",
  ship_from_country: "US",
  default_shipping_method: "usps_ground_advantage",
  default_handling_days: 2,
};
const fields = [
  ["ship_from_name", "Full name"],
  ["ship_from_phone", "Phone number"],
  ["ship_from_line1", "Street address"],
  ["ship_from_line2", "Apartment or suite (optional)"],
  ["ship_from_city", "City"],
  ["ship_from_region", "State (two letters)"],
  ["ship_from_postal_code", "ZIP code"],
] as const;
export function ShopperShippingForm() {
  const fetchShipping = useServerFn(getShopperShipping);
  const save = useServerFn(saveShopperShipping);
  const queryClient = useQueryClient();
  const shipping = useQuery({ queryKey: ["shopper-shipping"], queryFn: () => fetchShipping() });
  const [draft, setDraft] = useState<ShopperShipping>(empty);
  useEffect(() => {
    if (!shipping.data) return;
    const d = shipping.data;
    setDraft({
      ...empty,
      ...Object.fromEntries(Object.entries(d).filter(([, value]) => value != null)),
    } as ShopperShipping);
  }, [shipping.data]);
  const mutation = useMutation({
    mutationFn: () => save({ data: draft }),
    onSuccess: async () => {
      await Promise.all(
        ["shopper-shipping", "shopper-shipping-ready", "sourcing-options", "seller-setup"].map(
          (key) => queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      toast.success("Your shipping setup is saved.");
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <section id="shopper-shipping" className="mt-8 rounded-lg border border-border bg-card">
      <div className="hairline-b px-4 py-3">
        <h2 className="text-[13px] font-semibold">Shipping setup</h2>
      </div>
      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <p className="text-[12.5px] text-muted-foreground">
          Your private US ship-from address is used for delivery rates and labels. It is not shown
          on your public profile. If you also sell, this updates the same shipping address.
        </p>
        {shipping.isError && (
          <p role="alert">
            Could not load your saved address.{" "}
            <button type="button" className="underline" onClick={() => void shipping.refetch()}>
              Retry
            </button>
          </p>
        )}
        <fieldset
          disabled={shipping.isLoading || shipping.isError || mutation.isPending}
          className="grid gap-4 sm:grid-cols-2"
        >
          {fields.map(([key, label]) => (
            <label key={key} className="text-[12.5px]">
              {label}
              <input
                required={key !== "ship_from_line2"}
                maxLength={key === "ship_from_region" ? 2 : 120}
                className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3"
                value={draft[key]}
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
              />
            </label>
          ))}
          <label className="text-[12.5px]">
            Default shipping method
            <select
              className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3"
              value={draft.default_shipping_method}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  default_shipping_method: event.target
                    .value as ShopperShipping["default_shipping_method"],
                })
              }
            >
              {sellerShippingMethods.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12.5px]">
            Ships within (business days)
            <select
              className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3"
              value={draft.default_handling_days}
              onChange={(event) =>
                setDraft({ ...draft, default_handling_days: Number(event.target.value) })
              }
            >
              {[1, 2, 3, 4, 5].map((days) => (
                <option key={days} value={days}>
                  {days}
                </option>
              ))}
            </select>
          </label>
          <button className="h-11 rounded-md bg-primary px-5 text-primary-foreground" type="submit">
            {mutation.isPending ? "Saving…" : "Save shipping setup"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
