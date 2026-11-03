// Admin's controls, drawn with the install's UI kit, Chakra, in
// packages/ui. The screens draw everything but their layout through these.
import {
  Badge as KitBadge,
  Box,
  Button as KitButton,
  Card,
  Checkbox,
  Field as KitField,
  Input,
  Provider,
  RadioGroup,
  Table as KitTable,
  Text,
} from "@internal/ui";
import type { ComponentProps, ReactNode } from "react";

/** Gives the page Chakra's theme. */
export function Root({ children }: { children: ReactNode }) {
  return <Provider>{children}</Provider>;
}

export function Field({
  label,
  size,
  ...input
}: { label: string; name: string } & ComponentProps<"input">) {
  return (
    <KitField.Root gap="1.5">
      <KitField.Label>{label}</KitField.Label>
      <Input size="sm" htmlSize={size} {...input} />
    </KitField.Root>
  );
}

const buttonLook = {
  primary: { variant: "solid", size: "sm" },
  outline: { variant: "outline", size: "xs" },
} as const;

export function Button({
  look,
  type = "button",
  ...button
}: { look: keyof typeof buttonLook } & Omit<
  ComponentProps<"button">,
  "className" | "color"
>) {
  return <KitButton type={type} {...buttonLook[look]} {...button} />;
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <Text role="alert" textStyle="sm" color="fg.error">
      {children}
    </Text>
  );
}

/** A raised surface holding one form or one item. */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <Card.Root rounded="xl">
      <Card.Body display="grid" gap="4">
        {children}
      </Card.Body>
    </Card.Root>
  );
}

export function Table({
  head,
  children,
}: {
  head: readonly ReactNode[];
  children: ReactNode;
}) {
  return (
    <Box overflowX="auto" rounded="xl" borderWidth="1px" bg="bg.panel" px="2">
      <KitTable.Root size="sm" bg="transparent">
        <KitTable.Header>
          <KitTable.Row bg="transparent">
            {head.map((heading, column) => (
              <KitTable.ColumnHeader key={column} color="fg.muted">
                {heading}
              </KitTable.ColumnHeader>
            ))}
          </KitTable.Row>
        </KitTable.Header>
        <KitTable.Body>{children}</KitTable.Body>
      </KitTable.Root>
    </Box>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <KitTable.Row bg="transparent">{children}</KitTable.Row>;
}

const cellLook = {
  plain: {},
  strong: { fontWeight: "medium" },
  code: { fontFamily: "mono" },
  end: { textAlign: "end" },
} as const;

export function Cell({
  look = "plain",
  children,
}: {
  look?: keyof typeof cellLook;
  children?: ReactNode;
}) {
  return <KitTable.Cell {...cellLook[look]}>{children}</KitTable.Cell>;
}

const badgeLook = {
  primary: { variant: "solid" },
  secondary: { variant: "subtle" },
  destructive: { variant: "subtle", colorPalette: "red" },
  outline: { variant: "outline" },
} as const;

export function Badge({
  look,
  children,
}: {
  look: keyof typeof badgeLook;
  children: string;
}) {
  return (
    <KitBadge rounded="full" {...badgeLook[look]}>
      {children}
    </KitBadge>
  );
}

/**
 * Ark draws a checkbox or radio as a styled control beside a hidden native
 * input, shrunk to a pixel under the control. This lays the input, still
 * invisible, over its whole label instead, so a click anywhere on the label
 * lands on the input itself, as it does on a plain checkbox.
 */
const overLabel = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  clip: "auto",
  opacity: 0,
  cursor: "pointer",
} as const;

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
    <Checkbox.Root
      size="sm"
      position="relative"
      checked={checked}
      onCheckedChange={(details) => {
        // Chakra also reports "indeterminate", which these never show.
        onCheckedChange(details.checked === true);
      }}
    >
      <Checkbox.HiddenInput style={overLabel} />
      <Checkbox.Control />
      <Checkbox.Label fontWeight="normal">{children}</Checkbox.Label>
    </Checkbox.Root>
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
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <RadioGroup.Root
        size="sm"
        name={name}
        value={value}
        onValueChange={(details) => {
          const option = options.find(
            (candidate) => candidate.value === details.value,
          );
          if (option) onValueChange(option.value);
        }}
        display="flex"
        flexWrap="wrap"
        gap="4"
      >
        {options.map((option) => (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            position="relative"
          >
            <RadioGroup.ItemHiddenInput style={overLabel} />
            <RadioGroup.ItemIndicator />
            <RadioGroup.ItemText>{option.label}</RadioGroup.ItemText>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </fieldset>
  );
}
