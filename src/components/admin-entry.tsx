"use client";

import { useEffect, useState, type FormEvent } from "react";

const STORAGE_KEY = "varebil-admin-link-unlocked";

export function AdminEntry({
  adminUrl,
  accessCode,
}: {
  adminUrl: string;
  accessCode: string;
}) {
  const code = accessCode.trim();
  const [unlocked, setUnlocked] = useState(!code);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!code) {
      setUnlocked(true);
      return;
    }
    try {
      setUnlocked(localStorage.getItem(STORAGE_KEY) === code);
    } catch {
      setUnlocked(false);
    }
  }, [code]);

  function unlock(e: FormEvent) {
    e.preventDefault();
    if (value.trim() !== code) {
      setError(true);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    setUnlocked(true);
    setOpen(false);
    setValue("");
    setError(false);
    window.location.href = adminUrl;
  }

  if (unlocked) {
    return (
      <a
        href={adminUrl}
        className="text-sm text-stone-500 hover:text-teal-800 hover:underline"
      >
        Admin
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(false);
        }}
        className="text-sm text-stone-500 hover:text-teal-800 hover:underline"
      >
        Admin
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 px-4"
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={unlock}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-lg"
          >
            <h2 className="text-lg font-semibold tracking-tight text-teal-900">
              Admin access
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Enter the access code to open the admin dashboard.
            </p>
            <label className="mt-5 block space-y-1.5">
              <span className="text-sm font-medium text-stone-700">
                Access code
              </span>
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(false);
                }}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-teal-800/30 focus:ring-2"
              />
            </label>
            {error ? (
              <p className="mt-2 text-sm text-rose-700">Wrong code.</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-medium text-white hover:bg-teal-900"
              >
                Open admin
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
