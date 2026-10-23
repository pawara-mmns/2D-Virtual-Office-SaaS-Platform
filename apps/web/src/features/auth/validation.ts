export type AuthMode = "login" | "register" | "forgot-password" | "reset-password";
export type FieldName = "email" | "password" | "confirmPassword";
export type FieldErrors = Partial<Record<FieldName, string>>;
export type AuthState = {
  status: "idle" | "error" | "success";
  message?: string;
  fields?: FieldErrors;
};

export const passwordMinLength = 12;
export const passwordMaxLength = 128;

export function validateAuthForm(mode: AuthMode, form: FormData) {
  const read = (name: FieldName) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const email = read("email").trim();
  const password = read("password");
  const confirmPassword = read("confirmPassword");
  const fields: FieldErrors = {};

  if (mode !== "reset-password" &&
      (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    fields.email = "Enter a valid email address.";
  }

  if (mode === "login" && (!password || password.length > passwordMaxLength)) {
    fields.password = "Enter your password (up to 128 characters).";
  }

  if (mode === "register" || mode === "reset-password") {
    if (password.length < passwordMinLength || password.length > passwordMaxLength) {
      fields.password = "Use between 12 and 128 characters.";
    }
    if (password !== confirmPassword) {
      fields.confirmPassword = "Passwords do not match.";
    }
  }

  return { email, password, fields, valid: Object.keys(fields).length === 0 };
}
