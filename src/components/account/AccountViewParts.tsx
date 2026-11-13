import type { ReactNode } from "react";
import { CheckCircle, UserCircle, ShieldCheck } from "@phosphor-icons/react";
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[14px] font-bold tracking-tight">{title}</h3>
      {action}
    </div>
  );
}
export function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-secondary/55 p-3">
      <p className="text-[21px] font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
export function TrustBadge({ icon: Icon, label }: { icon: typeof CheckCircle; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground">
      <Icon size={13} className="text-primary" weight="fill" />
      {label}
    </span>
  );
}
export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-[12px] font-medium ${className}`}>
      <span className="block">{label}</span>
      {children}
    </label>
  );
}
export function SettingLine({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0">
      <div>
        <p className="text-[12px] font-semibold">{label}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{value}</p>
      </div>
      {children}
    </div>
  );
}
export function SettingsBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserCircle;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border p-5 last:border-b-0">
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-primary" />
        <h3 className="text-[14px] font-bold">{title}</h3>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
export function PreferenceCard({
  title,
  body,
  rows,
  onChange,
  onSave,
  saving,
}: {
  title: string;
  body: string;
  rows: { key: string; label: string; value: boolean }[];
  onChange: (key: string, value: boolean) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-[14px] font-bold">{title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-4 divide-y divide-border">
        {rows.map((row) => (
          <ToggleRow
            key={row.key}
            label={row.label}
            checked={row.value}
            onChange={(value) => onChange(row.key, value)}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-5 h-9 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </section>
  );
}
export function ToggleRow({
  label,
  body,
  checked,
  onChange,
}: {
  label: string;
  body?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-[12px] font-medium">{label}</span>
        {body && (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
            {body}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--color-primary)]"
      />
    </label>
  );
}

export function AccountAppControls({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <SettingsBlock title="App permissions and support" icon={ShieldCheck}>
        {children}
      </SettingsBlock>
    </div>
  );
}
