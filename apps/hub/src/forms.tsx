import { useState, type SubmitEvent } from "react";
import { setUp, signIn, type CoreResult, type Session } from "./core-api.ts";
import { Button, Card, Field, FormError, Heading } from "./ui.tsx";

export type Sending =
  { state: "idle" } | { state: "sending" } | { state: "failed"; error: string };

/**
 * Tracks one request to core at a time. On success the hub moves to the
 * session core answered with, which unmounts the form.
 */
export function useSend(onSession: (session: Session) => void) {
  const [sending, setSending] = useState<Sending>({ state: "idle" });

  function fail(error: string) {
    setSending({ state: "failed", error });
  }

  async function send(request: () => Promise<CoreResult>) {
    setSending({ state: "sending" });
    const result = await request();
    if (result.ok) onSession(result.session);
    else fail(result.error);
  }

  return { sending, send, fail };
}

interface FormProps {
  core: string;
  onSession: (session: Session) => void;
}

const minPasswordLength = 12;

export function Setup({ core, onSession }: FormProps) {
  const { sending, send, fail } = useSend(onSession);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = text(form, "username");
    const password = text(form, "password");
    if (password.length < minPasswordLength) {
      fail(
        `Use a password of at least ${String(minPasswordLength)} characters.`,
      );
    } else if (password !== text(form, "confirm")) {
      fail("The two passwords don't match.");
    } else {
      void send(() => setUp(core, { username, password }));
    }
  }

  return (
    <Card>
      <Heading>Set up this install</Heading>
      <p className="mt-2 text-sm text-neutral-500">
        Whoever sets up a new install becomes its owner. Pick the username and
        password you'll sign in with.
      </p>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <Field label="Username" name="username" autoComplete="username" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
        />
        <Field
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
        />
        <Submit sending={sending}>Create owner</Submit>
      </form>
    </Card>
  );
}

export function SignIn({ core, onSession }: FormProps) {
  const { sending, send } = useSend(onSession);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void send(() =>
      signIn(core, {
        username: text(form, "username"),
        password: text(form, "password"),
      }),
    );
  }

  return (
    <Card>
      <Heading>Sign in</Heading>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <Field label="Username" name="username" autoComplete="username" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
        <Submit sending={sending}>Sign in</Submit>
      </form>
    </Card>
  );
}

function Submit({ sending, children }: { sending: Sending; children: string }) {
  return (
    <>
      <Button
        look="primary"
        type="submit"
        disabled={sending.state === "sending"}
      >
        {children}
      </Button>
      {sending.state === "failed" && <FormError>{sending.error}</FormError>}
    </>
  );
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
