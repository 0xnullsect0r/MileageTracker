"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/login/actions";
import { Button, Field, inputClass } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="w-full max-w-sm">
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-6">
        <Field label="Email">
          <input
            className={inputClass}
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
          />
        </Field>
        <Field label="Password" error={state.error}>
          <input
            className={inputClass}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" variant="primary" disabled={pending} className="w-full">
          {pending ? "Checking…" : "Sign in"}
        </Button>
      </div>
    </form>
  );
}
