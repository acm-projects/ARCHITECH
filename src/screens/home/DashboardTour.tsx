import { ArchieMark, Button, Icon } from "../../components/ui";
import type { ExperienceLevel } from "../../types";
import {
  ADVANCED_DASHBOARD_TOUR,
  BEGINNER_DASHBOARD_TOUR,
  DASHBOARD_TOUR,
} from "./homeData";

export function DashboardTour({
  step,
  level,
  close,
  next,
}: {
  step: number;
  level: ExperienceLevel;
  close: () => void;
  next: () => void;
}) {
  const [title, defaultText] = DASHBOARD_TOUR[step];
  const text =
    level === "Beginner"
      ? BEGINNER_DASHBOARD_TOUR[step]
      : level === "Advanced"
        ? ADVANCED_DASHBOARD_TOUR[step]
        : defaultText;
  return <div className={`dashboard-tip tip-${step}`} role="dialog" aria-label="Dashboard tour"><span className="archie-dashboard-guide"><ArchieMark variant={level === "Beginner" ? "beginner" : level === "Intermediate" ? "intermediate" : "advanced"} size={28} /><b>Archie</b><em>{step + 1} / 8 · {level.toUpperCase()}</em></span><h3>{title}</h3><p>{text}</p><div><button onClick={close}>Skip tour</button><Button variant="soft" onClick={next}>{step === 7 ? "Finish" : level === "Beginner" ? "Show me" : "Next"} <Icon name="arrow" size={13} /></Button></div></div>;
}
