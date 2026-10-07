"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { readLocalUser } from "../../lib/localUser";
import { signOut } from "../../lib/session";

// The signed-in user's initials, with the account menu: who is signed in, and Sign out.
export default function ProfileMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user] = useState(readLocalUser);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Account: ${user.displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0A0A0A] text-[11px] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        {user.initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-44 rounded-md border border-neutral-200 bg-white py-1 text-[13px]"
        >
          <p className="truncate px-3 py-1.5 text-neutral-500">{user.displayName}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
              router.replace("/");
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-neutral-100"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
