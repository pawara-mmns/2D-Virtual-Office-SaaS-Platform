"use client";

import { useActionState } from "react";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "./actions";
import { passwordMaxLength, passwordMinLength, type AuthMode, type AuthState, type FieldName } from "./validation";

const actions = {
  login: loginAction,
  register: registerAction,
  "forgot-password": forgotPasswordAction,
  "reset-password": resetPasswordAction,
};
const labels = {
  login: ["Sign in", "Signing in…"],
  register: ["Create account", "Creating account…"],
  "forgot-password": ["Send reset link", "Sending…"],
  "reset-password": ["Save new password", "Saving…"],
};
const initialState: AuthState = { status: "idle" };

export function AuthForm({ mode, configured }: { mode: AuthMode; configured: boolean }) {
  const [state, action, pending] = useActionState(actions[mode], initialState);
  const newPassword = mode === "register" || mode === "reset-password";
  const completed = state.status === "success";

  function field(name: FieldName, label: string, type: "email" | "password", autoComplete: string) {
    const error = state.fields?.[name];
    const hint = newPassword && name === "password";
    return (
      <div>
        <label htmlFor={name} className="mb-2 block text-sm font-medium">{label}</label>
        <input
          id={name}
          name={name}
          type={type}
          required
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          minLength={type === "password" && newPassword ? passwordMinLength : undefined}
          maxLength={type === "email" ? 254 : passwordMaxLength}
          aria-invalid={Boolean(error)}
          aria-describedby={[error ? `${name}-error` : "", hint ? "password-hint" : ""].filter(Boolean).join(" ") || undefined}
          className="auth-input"
        />
        {hint && <p id="password-hint" className="mt-2 text-xs leading-5 text-muted">Use 12–128 characters. A long, unique passphrase works well.</p>}
        {error && <p id={`${name}-error`} className="mt-2 text-sm text-red-800">{error}</p>}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" aria-busy={pending}>
      <div aria-live="polite" aria-atomic="true">
        {state.message && (
          <p role={state.status === "error" ? "alert" : "status"} className={`border-l-2 px-3 py-2 text-sm leading-6 ${state.status === "error" ? "border-red-700 bg-red-50 text-red-900" : "border-forest bg-surface text-ink"}`}>
            {state.message}
          </p>
        )}
      </div>
      <fieldset disabled={pending || !configured || completed} className="space-y-5 disabled:opacity-70">
        {mode !== "reset-password" && field("email", "Email address", "email", "email")}
        {mode !== "forgot-password" && field("password", newPassword ? "New password" : "Password", "password", newPassword ? "new-password" : "current-password")}
        {newPassword && field("confirmPassword", "Confirm password", "password", "new-password")}
        <button type="submit" className="auth-button w-full">{pending ? labels[mode][1] : labels[mode][0]}</button>
      </fieldset>
    </form>
  );
}
