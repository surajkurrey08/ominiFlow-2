"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { validateLogin, validateRegistration } from "@/lib/auth/validation";

interface AuthFormProps {
  mode: "login" | "register";
  destination?: string;
}

interface AuthApiResponse {
  error?: string;
}

export function AuthForm({ mode, destination = "/dashboard" }: AuthFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const validationError = isRegister
      ? validateRegistration({
          email,
          password,
          confirmPassword: String(form.get("confirm_password") ?? ""),
          firstName: String(form.get("first_name") ?? ""),
          lastName: String(form.get("last_name") ?? ""),
          tenantName: String(form.get("tenant_name") ?? ""),
        })
      : validateLogin(email, password);

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const body = isRegister
        ? {
            email,
            password,
            first_name: String(form.get("first_name") ?? "").trim(),
            last_name: String(form.get("last_name") ?? "").trim() || null,
            tenant_name: String(form.get("tenant_name") ?? "").trim(),
          }
        : { email, password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as AuthApiResponse;

      if (!response.ok) {
        setError(payload.error ?? "Something went wrong. Please try again.");
        return;
      }

      if (isRegister) {
        router.replace("/login?registered=1");
      } else {
        router.replace(destination);
        router.refresh();
      }
    } catch {
      setError("We could not reach the service. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {isRegister && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" name="first_name" autoComplete="given-name" required maxLength={100} />
            <Field label="Last name" name="last_name" autoComplete="family-name" maxLength={100} />
          </div>
          <Field label="Workspace name" name="tenant_name" autoComplete="organization" required minLength={2} maxLength={150} />
        </>
      )}
      <Field label="Work email" name="email" type="email" autoComplete="email" required maxLength={320} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={isRegister ? "new-password" : "current-password"}
        required
        minLength={isRegister ? 8 : 1}
        maxLength={128}
      />
      {isRegister && (
        <Field label="Confirm password" name="confirm_password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#176b59] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#125747] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b59] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Please wait…" : isRegister ? "Create workspace" : "Sign in"}
      </button>

      <p className="text-center text-sm text-slate-600">
        {isRegister ? "Already have an account? " : "New to Omniflow? "}
        <Link className="font-semibold text-[#176b59] underline-offset-4 hover:underline" href={isRegister ? "/login" : "/register"}>
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
      {!isRegister && (
        <p className="text-center text-sm">
          <Link className="font-semibold text-[#176b59] underline-offset-4 hover:underline" href="/forgot-password">
            Forgot password?
          </Link>
        </p>
      )}
    </form>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}

function Field({ label, name, type = "text", ...props }: FieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;
  const id = `auth-${name}`;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={inputType}
          className={`min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#258672] focus:ring-4 focus:ring-[#258672]/10 ${
            isPassword ? "pr-11" : ""
          }`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 focus:outline-hidden cursor-pointer transition-colors"
          >
            {showPassword ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
