import { useEffect, useState } from "react";

import { Button, Field, Icon, IconButton, SelectInput, TextInput } from "../../components/ui";
import type { ExperienceLevel } from "../../types";
import {
  getDefaultNodeProperties,
  getNodeDefinition,
  getNodeSummary,
  type NodePropertyValue,
  type NodePropertyValues,
} from "./workspaceData";

export function NodeConfigPanel({
  nodeName,
  level,
  currentProperties,
  close,
  apply,
  screenX,
  screenY,
}: {
  nodeName: string;
  level: ExperienceLevel;
  currentProperties: NodePropertyValues;
  close: () => void;
  apply: (properties: NodePropertyValues) => void;
  screenX?: number;
  screenY?: number;
}) {
  const definition = getNodeDefinition(nodeName);
  const defaults = getDefaultNodeProperties(nodeName);
  const [draft, setDraft] = useState<NodePropertyValues>({
    ...defaults,
    ...currentProperties,
  });

  useEffect(() => {
    setDraft({ ...getDefaultNodeProperties(nodeName), ...currentProperties });
  }, [nodeName, currentProperties]);

  const update = (key: string, value: NodePropertyValue) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <div
      className="configure-panel architecture-config-panel"
      role="dialog"
      aria-label={`Configure ${nodeName}`}
      style={
        screenX !== undefined
          ? { left: screenX, top: screenY, right: "auto" }
          : {}
      }
    >
      <div className="architecture-config-head">
        <span className="config-node-icon">
          <Icon name={definition.icon} size={17} />
        </span>
        <span>
          <small>{definition.category} · {definition.label}</small>
          <b>{nodeName}</b>
        </span>
        <IconButton icon="close" label="Close properties" tooltip="Close" size="sm" onClick={close} />
      </div>

      <div className="architecture-config-summary">
        <span>NODE SUMMARY</span>
        <b>{getNodeSummary(nodeName, draft)}</b>
        <small>{definition.description}</small>
      </div>

      <div className="config-properties-grid">
        {definition.fields.map((field) => (
          <Field
            key={field.key}
            className="config-property"
            label={field.label}
            meta={field.unit}
          >
            {field.type === "select" ? (
              <SelectInput
                value={String(draft[field.key] ?? "")}
                onChange={(event) => update(field.key, event.target.value)}
              >
                {field.options?.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            ) : (
              <span className="config-input-wrap">
                <TextInput
                  type={field.type}
                  value={String(draft[field.key] ?? "")}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    update(
                      field.key,
                      field.type === "number"
                        ? Number(event.target.value)
                        : event.target.value,
                    )
                  }
                />
                {field.unit && <i>{field.unit}</i>}
              </span>
            )}
          </Field>
        ))}
      </div>

      <div className="architecture-config-foot">
        <span>{level} workspace · changes apply to this node only</span>
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="config-reset"
            onClick={() => setDraft(getDefaultNodeProperties(nodeName))}
          >
            Reset
          </Button>
          <Button
            className="config-apply-btn"
            onClick={() => {
              apply(draft);
              close();
            }}
          >
            Apply changes
          </Button>
        </div>
      </div>
    </div>
  );
}
