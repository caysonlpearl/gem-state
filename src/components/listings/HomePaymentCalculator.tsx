import { useState } from "react";
import { loanPaymentCents } from "@/lib/loan-payment";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

export function HomePaymentCalculator({
  priceCents,
  annualTax,
}: {
  priceCents: number;
  annualTax?: number | null;
}) {
  const [down, setDown] = useState(String(Math.round((priceCents / 100) * 0.2)));
  const [apr, setApr] = useState("6.75");
  const [years, setYears] = useState("30");
  const [tax, setTax] = useState(annualTax != null ? String(Math.round(annualTax / 12)) : "");
  const [insurance, setInsurance] = useState("");
  const [hoa, setHoa] = useState("");
  const downNumber = down.trim() ? Number(down) : NaN;
  const aprNumber = apr.trim() ? Number(apr) : NaN;
  const extras = [tax, insurance, hoa].map((v) => (v.trim() ? Number(v) : 0));
  const valid =
    Number.isFinite(downNumber) &&
    downNumber >= 0 &&
    downNumber * 100 <= priceCents &&
    extras.every((v) => Number.isFinite(v) && v >= 0);
  const principal = valid
    ? loanPaymentCents(Math.round(priceCents - downNumber * 100), Number(years) * 12, aprNumber)
    : null;
  const extraCents = Math.round(extras.reduce((a, b) => a + b, 0) * 100);
  const fields = [
    ["Down payment ($)", down, setDown, "1"],
    ["Interest rate (%)", apr, setApr, "0.01"],
    ["Property taxes ($/mo)", tax, setTax, "1"],
    ["Home insurance ($/mo)", insurance, setInsurance, "1"],
    ["HOA fees ($/mo)", hoa, setHoa, "1"],
  ] as const;
  return (
    <div>
      <h2 className="text-[23px] font-bold tracking-tight">Payment calculator</h2>
      <div className="mt-5 rounded-2xl border border-[#cddfe9] bg-[#eef6fb] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[13px] text-muted-foreground">Estimated monthly payment</p>
            <p className="mt-1 text-[32px] font-extrabold leading-tight tracking-tight text-primary">
              {principal != null ? money(principal + extraCents) : "—"}
              <span className="ml-1 text-[14px] font-medium">/mo</span>
            </p>
          </div>
          {principal != null ? (
            <div className="text-[12px] leading-6 text-muted-foreground">
              <p>
                Principal &amp; interest{" "}
                <strong className="ml-3 text-foreground">{money(principal)}</strong>
              </p>
              {extraCents > 0 ? (
                <p>
                  Added monthly costs{" "}
                  <strong className="ml-3 text-foreground">{money(extraCents)}</strong>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fields.map(([label, value, setter, step]) => (
            <label key={label} className="text-[12px] font-semibold">
              {label}
              <input
                type="number"
                min="0"
                step={step}
                value={value}
                onChange={(e) => setter(e.target.value)}
                placeholder="Add amount"
                className="mt-1.5 h-11 w-full rounded-xl border border-[#bfd2df] bg-white px-3 text-[14px] font-medium outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          ))}
          <label className="text-[12px] font-semibold">
            Loan term
            <select
              value={years}
              onChange={(e) => setYears(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-[#bfd2df] bg-white px-3 text-[14px] font-medium"
            >
              {[30, 20, 15, 10].map((y) => (
                <option key={y} value={y}>
                  {y} years
                </option>
              ))}
            </select>
          </label>
        </div>
        {principal == null ? (
          <p role="alert" className="mt-3 text-[12px] text-red-700">
            Enter a valid down payment, an interest rate from 0% to 100%, and nonnegative monthly
            costs.
          </p>
        ) : null}
        <p className="mt-4 text-[12px] leading-5 text-muted-foreground">
          Illustrative estimate using the inputs above, not a loan offer or current rate quote.
          Blank taxes, insurance and HOA fields are excluded. Mortgage insurance and closing costs
          are not included.
        </p>
      </div>
    </div>
  );
}
