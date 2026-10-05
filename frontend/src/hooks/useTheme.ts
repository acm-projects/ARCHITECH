import { useEffect, useState } from "react";

import { readStorage, STORAGE_KEYS, writeStorage } from "../lib/storage";

export function useTheme() {
  const [dark, setDark] = useState(() => readStorage(STORAGE_KEYS.theme) === "dark");

  useEffect(() => {
    writeStorage(STORAGE_KEYS.theme, dark ? "dark" : "light");
  }, [dark]);

  return [dark, setDark] as const;
}
