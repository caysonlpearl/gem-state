import { useRef, useState } from "react";
import { CaretDown, Check, MapPin } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Option = { value: string; label: string };

export function HomeSearchDropdown({ value, onChange, options, label, placeholder, editable = false }: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  label: string;
  placeholder: string;
  editable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const filtered = editable && value
    ? options.filter((option) => option.label.toLowerCase().includes(value.toLowerCase()))
    : options;
  const visibleOptions = editable && value && !filtered.some((option) => option.value === value)
    ? [{ value, label: value }, ...filtered]
    : filtered;
  const select = (next: string) => { onChange(next); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="soft-control relative flex h-10 min-w-0 items-center gap-2 px-3 sm:h-12 sm:px-4">
          {editable ? <>
            <MapPin size={16} weight="duotone" className="shrink-0 text-primary" aria-hidden="true" />
            <input
              type="search"
              value={value}
              aria-label={label}
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              placeholder={placeholder}
              onFocus={() => setOpen(true)}
              onChange={(event) => { onChange(event.target.value); setOpen(true); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setOpen(true);
                  requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("[role=option]")?.focus());
                }
                if (event.key === "Enter") setOpen(false);
              }}
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
            />
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Show locations" className="h-7 w-7 shrink-0 rounded-full text-muted-foreground">
                <CaretDown weight="bold" />
              </Button>
            </PopoverTrigger>
          </> : <PopoverTrigger asChild>
            <Button type="button" variant="ghost" role="combobox" aria-label={label} aria-expanded={open} className="h-full w-full justify-between rounded-full p-0 font-normal hover:bg-transparent">
              <span className="truncate text-base md:text-sm">{options.find((option) => option.value === value)?.label ?? placeholder}</span>
              <CaretDown weight="bold" className="text-muted-foreground" />
            </Button>
          </PopoverTrigger>}
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={8} className="w-72 max-w-[calc(100vw-2rem)] p-1" onOpenAutoFocus={(event) => {
        event.preventDefault();
        if (!editable) menuRef.current?.querySelector<HTMLButtonElement>("[role=option]")?.focus();
      }} onCloseAutoFocus={(event) => { if (editable) event.preventDefault(); }}>
        <div ref={menuRef} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto" onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? []);
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        }}>
          {visibleOptions.map((option) => <Button key={option.value} type="button" variant="ghost" role="option" aria-selected={value === option.value} onClick={() => select(option.value)} className="h-9 w-full justify-between rounded-sm px-3 text-sm font-normal focus:bg-accent focus:text-accent-foreground">
            <span className="truncate">{option.label}</span>
            {value === option.value ? <Check className="shrink-0 text-primary" /> : null}
          </Button>)}
        </div>
      </PopoverContent>
    </Popover>
  );
}