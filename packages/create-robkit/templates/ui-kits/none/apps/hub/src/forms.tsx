import type { Result } from "@internal/core-client";
import { useState, type SubmitEvent } from "react";
import { setUp, signIn, signInWithCode, type Session } from "./core-api.ts";
import { Button, Card, Field, FormError, Heading } from "./ui.tsx";

export type Sending =
  { state: "idle" } | { state: "sending" } | { state: "failed"; error: string };

/**
 * Tracks one request to core at a time. On success the hub moves to the
 * session core answered with, which unmounts the form.
 */
export function useSend(
  onSession: (session: Session) => void,
  initial: Sending = { state: "idle" },
) {
  const [sending, setSending] = useState<Sending>(initial);

  function fail(error: string) {
    setSending({ state: "failed", error });
  }

  async function send(request: () => Promise<Result<Session>>) {
    setSending({ state: "sending" });
    const result = await request();
    if (result.ok) onSession(result.value);
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

/**
 * The signed-out screen. Most visitors are guests, so it leads with the
 * access code and keeps the owner's password one click away.
 */
export function SignIn({
  core,
  onSession,
  error,
}: FormProps & { error?: string }) {
  const [form, setForm] = useState<"code" | "owner">("code");
  return form === "code" ? (
    <CodeSignIn
      core={core}
      onSession={onSession}
      error={error}
      onOwner={() => {
        setForm("owner");
      }}
    />
  ) : (
    <OwnerSignIn
      core={core}
      onSession={onSession}
      onCode={() => {
        setForm("code");
      }}
    />
  );
}

function CodeSignIn({
  core,
  onSession,
  error,
  onOwner,
}: FormProps & { error: string | undefined; onOwner: () => void }) {
  const { sending, send } = useSend(
    onSession,
    error === undefined ? { state: "idle" } : { state: "failed", error },
  );

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void send(() => signInWithCode(core, text(form, "code")));
  }

  return (
    <Card>
      <Heading>Sign in</Heading>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <Field
          label="Access code"
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <Submit sending={sending}>Sign in</Submit>
      </form>
      <Switch onClick={onOwner}>I'm the owner</Switch>
    </Card>
  );
}

function OwnerSignIn({
  core,
  onSession,
  onCode,
}: FormProps & { onCode: () => void }) {
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
      <Heading>Sign in as the owner</Heading>
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
      <Switch onClick={onCode}>Use an access code</Switch>
    </Card>
  );
}

function Switch({
  onClick,
  children,
}: {
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 text-sm text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline"
    >
      {children}
    </button>
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
