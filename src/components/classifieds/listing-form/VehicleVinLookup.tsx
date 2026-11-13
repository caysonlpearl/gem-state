import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { decodeVehicleVin } from "@/lib/vehicle.functions";
import { VehicleVinLookupView } from "./VehicleVinLookupView";
import { applyDecodedVin } from "./vin-fields";
import type { ListingFormState } from "./types";

export function VehicleVinLookup({
  form,
  set,
}: {
  form: ListingFormState;
  set: (key: keyof ListingFormState, value: string) => void;
}) {
  const decode = useServerFn(decodeVehicleVin);
  const decodeMutation = useMutation({
    mutationFn: () => decode({ data: { vin: form.vin } }),
    onSuccess: (result) => {
      applyDecodedVin(result, set);
      toast.success("Vehicle details filled from the VIN. Review and edit them before continuing.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not decode that VIN."),
  });

  return (
    <VehicleVinLookupView
      form={form}
      set={set}
      isPending={decodeMutation.isPending}
      decode={() => decodeMutation.mutate()}
    />
  );
}
