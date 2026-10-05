import { useState } from "react";

const INITIAL_TABS = ["Architecture", "Notes"];

export function useDiagramTabs(initial?: { tabs?: string[]; activeTab?: number }) {
  const initialTabs =
    initial?.tabs && initial.tabs.length > 0 ? initial.tabs : INITIAL_TABS;
  const [tabs, setTabs] = useState<string[]>(initialTabs);
  const [activeTab, setActiveTab] = useState(() =>
    Math.max(
      0,
      Math.min(initial?.activeTab ?? 0, initialTabs.length - 1),
    ),
  );

  const closeTab = (index: number) => {
    if (tabs.length === 1) return;

    const nextTabs = tabs.filter((_, tabIndex) => tabIndex !== index);
    setTabs(nextTabs);
    setActiveTab((current) =>
      Math.max(0, Math.min(current, nextTabs.length - 1)),
    );
  };

  const addTab = () => {
    setTabs([...tabs, `Untitled ${tabs.length + 1}`]);
    setActiveTab(tabs.length);
  };

  return {
    tabs,
    activeTab,
    setActiveTab,
    closeTab,
    addTab,
  };
}
