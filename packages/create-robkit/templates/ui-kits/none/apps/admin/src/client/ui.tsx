// Admin's controls. The screens draw everything but their layout through
// these, so a UI kit restyles admin by replacing this file.
import type { ComponentProps, ReactNode } from "react";

export function Field({
  label,
  ...input
}: { label: string; name: string } & ComponentProps<"input">) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <input
        className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm shadow-xs outline-none placeholder:text-neutral-400 focus-visible:border-neutral-400 focus-visible:ring-3 focus-visible:ring-neutral-200"
        {...input}
      />
    </label>
  );
}

const buttonLook = {
  primary: "h-9 px-4 bg-neutral-900 text-white hover:bg-neutral-800",
  outline:
    "h-8 px-3 border border-neutral-200 bg-white text-neutral-900 shadow-xs hover:bg-neutral-100",
};

export function Button({
  look,
  ...button
}: { look: keyof typeof buttonLook } & ComponentProps<"button">) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-neutral-300 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${buttonLook[look]}`}
      {...button}
    />
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-red-600">
      {children}
    </p>
  );
}

/** A raised surface holding one form or one item. */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      {children}
    </div>
  );
}

export function Table({
  head,
  children,
}: {
  head: readonly string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 text-neutral-500">
          <tr>
            {head.map((heading, column) => (
              <th key={column} className="px-4 py-2 font-medium">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({
  look = "plain",
  children,
}: {
  look?: "plain" | "strong" | "code" | "end";
  children?: ReactNode;
}) {
  const className = {
    plain: "px-4 py-3",
    strong: "px-4 py-3 font-medium",
    code: "px-4 py-3 font-mono",
    end: "px-4 py-3 text-right",
  }[look];
  return <td className={className}>{children}</td>;
}

const badgeLook = {
  primary: "bg-emerald-50 text-emerald-700",
  secondary: "bg-neutral-100 text-neutral-600",
  destructive: "bg-amber-50 text-amber-700",
  outline: "bg-sky-50 text-sky-700",
};

export function Badge({
  look,
  children,
}: {
  look: keyof typeof badgeLook;
  children: string;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeLook[look]}`}
    >
      {children}
    </span>
  );
}

/** A checkbox with its label beside it. */
export function Check({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onCheckedChange(event.currentTarget.checked);
        }}
      />
      {children}
    </label>
  );
}

/** One choice from a few, as radio buttons in a row. */
export function Choices<Value extends string>({
  legend,
  name,
  value,
  options,
  onValueChange,
}: {
  legend: string;
  /** Names the group's inputs, unique on the page. */
  name: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onValueChange: (value: Value) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium text-neutral-700">{legend}</legend>
      <div className="flex flex-wrap gap-4">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => {
                onValueChange(option.value);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
