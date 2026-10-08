// this file owns the signed-in user's small account menu and sign out behavior
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { signOut } from "../../lib/session";

// account menu for the signed-in user. shows the locally stored profile and provides
// the ui entry point for signing out
export default function ProfileMenu({ userName }: { userName?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const displayName = userName || "User";
  const userInitial = displayName.charAt(0).toUpperCase();
  const handleToggle = () => setOpen((value) => !value);

  // while the menu is open, close it when the user clicks outside or presses escape
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
        aria-label={`Account: ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleToggle}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0A0A0A] text-[11px] font-semibold tracking-widest text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        {userInitial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-44 rounded-md border border-neutral-200 bg-white py-1 text-[13px]"
        >
          <p className="truncate px-3 py-1.5 text-neutral-500">{displayName}</p>
          <button
            type="button"
            role="menuitem"
            // end the session first, then return the user to the public entry flow
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
