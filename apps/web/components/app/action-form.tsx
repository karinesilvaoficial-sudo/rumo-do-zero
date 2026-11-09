"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/errors";
import { Alert, SubmitButton } from "@/components/ui";

type Action = (prev: unknown, fd: FormData) => Promise<ActionResult<unknown>>;

/**
 * Formulário com estados reais (enviando, erro, sucesso) e chave de idempotência por abertura:
 * duplo clique ou reenvio não cria registro duplicado.
 */
export function ActionForm({ action, children, submit = "Salvar", success = "Salvo.", onDone, resetOnSuccess = true, className = "stack", disabled }: {
  action: Action; children: ReactNode; submit?: string; success?: string; onDone?: (data: unknown) => void; resetOnSuccess?: boolean; className?: string; disabled?: boolean;
}) {
  const router = useRouter();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [state, run] = useActionState(action, null as ActionResult<unknown> | null);
  const form = useRef<HTMLFormElement>(null);
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (resetOnSuccess) form.current?.reset();
      setKey(crypto.randomUUID());
      onDone?.(state.data);
      router.refresh();
    }
  }, [state, onDone, resetOnSuccess, router]);
  return (
    <form ref={form} action={run} className={className} noValidate={false}>
      <input type="hidden" name="idempotency_key" value={key} />
      {children}
      {state && !state.ok ? <Alert tone="error">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="ok">{success}</Alert> : null}
      <div className="row"><SubmitButton disabled={disabled}>{submit}</SubmitButton></div>
    </form>
  );
}

export function Field({ label, name, hint, children, ...rest }: { label: string; name: string; hint?: string; children?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field">
      <label htmlFor={`f-${name}`}>{label}</label>
      {children ?? <input id={`f-${name}`} name={name} className="input" aria-describedby={hint ? `h-${name}` : undefined} {...rest} />}
      {hint ? <span id={`h-${name}`} className="hint">{hint}</span> : null}
    </div>
  );
}

export function MoneyField({ label, name, required, hint, defaultValue }: { label: string; name: string; required?: boolean; hint?: string; defaultValue?: string }) {
  return <Field label={label} name={name} hint={hint ?? "Ex.: 1.234,56"} inputMode="decimal" autoComplete="off" required={required} pattern="[-−]?(R\$\s?)?[0-9.]+(,[0-9]{1,2})?" defaultValue={defaultValue} />;
}

export function Select({ label, name, options, required, defaultValue, hint }: { label: string; name: string; options: { value: string; label: string }[]; required?: boolean; defaultValue?: string; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={`f-${name}`}>{label}</label>
      <select id={`f-${name}`} name={name} className="select" required={required} defaultValue={defaultValue}>
        {!required ? <option value="">—</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
