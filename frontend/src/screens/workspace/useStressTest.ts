import { useCallback, useEffect, useState } from "react";

import type { Mode } from "../../types";

interface UseStressTestOptions {
  mode: Mode;
  onLearnStepChange: (step: number) => void;
}

export function useStressTest({ mode, onLearnStepChange }: UseStressTestOptions) {
  const [running, setRunning] = useState(false);
  const [stressProgress, setStressProgress] = useState(0);
  const [stressComplete, setStressComplete] = useState(false);
  const [runStage, setRunStage] = useState(0);

  useEffect(() => {
    if (!running) {
      setRunStage(0);
      return;
    }

    const timer = window.setInterval(() => {
      setRunStage((stage) => (stage >= 4 ? 0 : stage + 1));
    }, 1050);

    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running) return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const next = Math.min(100, Math.round((Date.now() - startedAt) / 65));
      setStressProgress(next);

      if (next >= 100) {
        window.clearInterval(timer);
        setRunning(false);
        setStressComplete(true);
        if (mode === "learn") onLearnStepChange(0);
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [running, mode, onLearnStepChange]);

  const start = useCallback(() => {
    setStressProgress(0);
    setStressComplete(false);
    setRunning(true);
    if (mode === "learn") onLearnStepChange(1);
  }, [mode, onLearnStepChange]);

  const stop = useCallback(() => {
    setRunning(false);
  }, []);

  const clearResult = useCallback(() => {
    setStressComplete(false);
  }, []);

  return {
    running,
    stressProgress,
    stressComplete,
    runStage,
    start,
    stop,
    clearResult,
  };
}
