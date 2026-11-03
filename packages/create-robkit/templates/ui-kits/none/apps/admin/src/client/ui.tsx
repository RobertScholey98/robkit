// Admin's controls. The screens draw everything but their layout through
// these, so a UI kit restyles admin by replacing this file.
import type { ComponentProps, ReactNode } from "react";

export function Field({
  label,
  ...input
}: { label: string; name: string } & ComponentProps<"input">) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        {...input}
      />
    </label>
  );
}

const buttonLook = {
  primary: "h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/80",
  outline: "h-8 px-3 border bg-background shadow-xs hover:bg-muted",
};

export function Button({
  look,
  ...button
}: { look: keyof typeof buttonLook } & ComponentProps<"button">) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${buttonLook[look]}`}
      {...button}
    />
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

/** A raised surface holding one form or one item. */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
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
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-muted-foreground">
          <tr>
            {head.map((heading, column) => (
              <th key={column} className="px-4 py-2 font-medium">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
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
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive/10 text-destructive",
  outline: "border text-foreground",
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
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
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
