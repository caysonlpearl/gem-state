import { forwardRef, useId, useMemo, useRef, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";

import { findIdahoPlace, idahoPlaces } from "@/config/idaho-places";

const placeKey = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

/** Idaho places matching what's typed: names that start with it first. */
function matchingPlaces(query: string) {
  const key = placeKey(query);
  if (!key || findIdahoPlace(query)) return idahoPlaces;
  const starts = idahoPlaces.filter(([name]) => placeKey(name).startsWith(key));
  const contains = idahoPlaces.filter(
    ([name]) => !placeKey(name).startsWith(key) && placeKey(name).includes(key),
  );
  return [...starts, ...contains];
}

/**
 * A searchable dropdown of every Idaho city and town. Click to see the whole
 * list, or type to narrow it; picking a place fills in the listed spelling.
 */
export const IdahoCityPicker = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (city: string) => void;
    className: string;
    required?: boolean;
    invalid?: boolean;
    placeholder?: string;
    onBlur?: () => void;
  }
>(function IdahoCityPicker(
  { value, onChange, className, required, invalid, placeholder, onBlur },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const options = useMemo(() => matchingPlaces(value), [value]);
  const selected = findIdahoPlace(value)?.[0];

  function pick(name: string) {
    onChange(name);
    setOpen(false);
  }

  function show(index: number) {
    setActive(index);
    listRef.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }

  function openList() {
    setOpen(true);
    // Start at the chosen city so the list opens where you left it.
    const at = selected ? options.findIndex(([name]) => name === selected) : 0;
    requestAnimationFrame(() => show(Math.max(0, at)));
  }

  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        required={required}
        minLength={2}
        maxLength={80}
        value={value}
        placeholder={placeholder}
        onFocus={openList}
        onClick={() => !open && openList()}
        onBlur={() => {
          setOpen(false);
          // Settle on the listed spelling once they leave the field.
          if (selected && selected !== value) onChange(selected);
          onBlur?.();
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          show(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) return openList();
            const step = event.key === "ArrowDown" ? 1 : -1;
            show(Math.min(options.length - 1, Math.max(0, active + step)));
          } else if (event.key === "Enter" && open && options[active]) {
            event.preventDefault();
            pick(options[active][0]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`${className} pr-9`}
      />
      <CaretDown
        size={14}
        weight="bold"
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 text-muted-foreground"
      />
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-[13px] font-normal text-popover-foreground shadow-lg"
        >
          {options.length ? (
            options.map(([name, region], index) => (
              <li
                key={name}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={name === selected}
                // mousedown, not click, so the input keeps focus until we pick.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(name);
                }}
                onMouseMove={() => active !== index && setActive(index)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 ${
                  index === active ? "bg-secondary" : ""
                }`}
              >
                <span className="truncate">{name}</span>
                <span className="flex shrink-0 items-center gap-2 text-[11.5px] text-muted-foreground">
                  {region}
                  {name === selected ? <Check size={13} className="text-primary" /> : null}
                </span>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-muted-foreground">
              No Idaho town by that name. Choose the nearest one.
            </li>
          )}
        </ul>
      )}
    </div>
  );
});
