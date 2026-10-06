import {
  EmptyState,
  Icon,
  Menu,
  MenuItem,
  TextInput,
} from "../../components/ui";
import type { ExperienceLevel, Mode } from "../../types";
import type { DashboardSearchItem } from "./homeData";

interface SearchPaletteProps {
  query: string;
  items: DashboardSearchItem[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onOpen: (mode: Mode) => void;
}

export function SearchPalette({
  query,
  items,
  onQueryChange,
  onClose,
  onOpen,
}: SearchPaletteProps) {
  return (
    <div className="command-scrim" onMouseDown={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search ARCHITECT"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input">
          <Icon name="search" />
          <TextInput
            autoFocus
            placeholder="Search examples and challenges…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <kbd>esc</kbd>
        </div>

        <div className="command-results">
          {items.length ? (
            items.map((item) => (
              <button
                key={`${item.name}-${item.meta}`}
                onClick={() => {
                  onClose();
                  onOpen(item.mode);
                }}
              >
                <span>
                  <b>{item.name}</b>
                  <small>{item.meta}</small>
                </span>
                <Icon name="arrow" size={14} />
              </button>
            ))
          ) : (
            <EmptyState className="empty-state">
              No matches. Try an example or challenge name.
            </EmptyState>
          )}
        </div>

        <footer>
          <span><kbd>N</kbd> New project</span>
          <span><kbd>/</kbd> Search</span>
        </footer>
      </div>
    </div>
  );
}

interface ProfileMenuProps {
  name: string;
  initials: string;
  level: ExperienceLevel;
  dark: boolean;
  onReplayTour: () => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
}

export function ProfileMenu({
  name,
  initials,
  level,
  dark,
  onReplayTour,
  onToggleTheme,
  onSignOut,
}: ProfileMenuProps) {
  return (
    <Menu className="profile-menu" aria-label="Profile menu">
      <div>
        <span className="avatar">{initials}</span>
        <span>
          <b>{name}</b>
          <small>{level} workspace · local profile</small>
        </span>
      </div>
      <MenuItem onClick={onReplayTour}>Replay tour</MenuItem>
      <MenuItem onClick={onToggleTheme}>
        Switch to {dark ? "light" : "dark"} theme
      </MenuItem>
      <MenuItem onClick={onSignOut}>Sign out</MenuItem>
    </Menu>
  );
}
