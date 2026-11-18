// Small building blocks for the studio's dark side panels.

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[#2f3237] px-3 py-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#8b9099]">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-[#b4b8c0]">{label}</span>
      <span className="flex min-w-0 items-center gap-1">{children}</span>
    </label>
  );
}

const field =
  "h-7 rounded border border-[#3a3e45] bg-[#15161a] px-2 text-[#e6e8ec] outline-none focus:border-[#d17e5b]";

/** A number box that saves when you press Enter or click away. */
export function NumInput({
  value,
  onCommit,
  suffix,
  min,
  width = "w-20",
}: {
  value: number;
  onCommit: (value: number) => void;
  suffix?: string;
  min?: number;
  width?: string;
}) {
  return (
    <>
      <input
        key={value}
        type="text"
        inputMode="decimal"
        defaultValue={String(Math.round(value * 100) / 100)}
        onBlur={(event) => {
          const next = Number(event.target.value.replace(",", "."));
          if (Number.isFinite(next) && (min === undefined || next >= min)) {
            if (next !== value) onCommit(next);
          } else {
            event.target.value = String(value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        className={`${field} ${width} text-right`}
      />
      {suffix && <span className="text-[#8b9099]">{suffix}</span>}
    </>
  );
}

export function TextInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  return (
    <input
      key={value}
      type="text"
      defaultValue={value}
      onBlur={(event) => {
        if (event.target.value !== value) onCommit(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
      className={`${field} w-36`}
    />
  );
}

export function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${field} max-w-40`}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[#b4b8c0]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[#d17e5b]"
      />
      {label}
    </label>
  );
}

export function Btn({
  children,
  onClick,
  active = false,
  disabled = false,
  title,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`h-7 shrink-0 rounded border px-2.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-[#d17e5b] bg-[#d17e5b] text-white"
          : danger
            ? "border-[#5a3338] bg-[#2a1c1e] text-[#ff9aa5] hover:border-[#ff7a88]"
            : "border-[#3a3e45] bg-[#26282d] text-[#d7d9de] hover:border-[#6b7280]"
      }`}
    >
      {children}
    </button>
  );
}
