import type { ArchitectureNodeType } from "../workspace/nodes/ArchitectureNode";

// What the canvas must contain for a step to count as done. Objectives refer to
// component types, never labels or node ids, so renamed nodes still count.
export type ConnectionFeedback = { title: string; explanation: string };

export type ConnectionFeedbackRule = ConnectionFeedback & {
  sourceType: ArchitectureNodeType;
  targetType: ArchitectureNodeType;
};

export type LessonObjective =
  | { kind: "node"; componentType: ArchitectureNodeType }
  | {
      kind: "edge";
      sourceType: ArchitectureNodeType;
      targetType: ArchitectureNodeType;
      // Known misconceptions: connections that look related but are wrong here.
      // Any other connection that misses the objective is simply "unrelated".
      feedbackRules?: ConnectionFeedbackRule[];
    };

export type LessonStep = {
  id: number;
  title: string;
  description: string;
  instruction: string;
  // Shown briefly when the objective is met.
  successMessage: string;
  objective: LessonObjective;
};

export type Lesson = {
  id: string;
  title: string;
  // The finished architecture, shown on the completion state.
  summary: string;
  steps: LessonStep[];
};

export const firstWebSystemLesson: Lesson = {
  id: "first-web-system",
  title: "Build Your First Web System",
  summary: "Client → API Server → Database",
  steps: [
    {
      id: 1,
      title: "Add a Client",
      description: "Start with the user-facing entry point.",
      instruction: "Drag Client from Components onto the canvas.",
      successMessage: "Client added",
      objective: { kind: "node", componentType: "client" },
    },
    {
      id: 2,
      title: "Add an API Server",
      description:
        "The API server receives requests and runs your application logic.",
      instruction: "Drag an API Server onto the canvas.",
      successMessage: "API Server added",
      objective: { kind: "node", componentType: "server" },
    },
    {
      id: 3,
      title: "Connect Client to API Server",
      description: "Requests need a path from the client to your backend.",
      instruction:
        "Drag from the Client's right handle to the API Server's left handle.",
      successMessage: "Connection created",
      objective: {
        kind: "edge",
        sourceType: "client",
        targetType: "server",
        feedbackRules: [
          {
            sourceType: "server",
            targetType: "client",
            title: "Try reversing that connection.",
            explanation:
              "Requests normally travel from the client to the API server.",
          },
          {
            sourceType: "client",
            targetType: "database",
            title: "Connect the client to the API server first.",
            explanation:
              "The API server sits between the client and your data layer.",
          },
        ],
      },
    },
    {
      id: 4,
      title: "Add a Database",
      description: "Your application needs somewhere to persist data.",
      instruction: "Drag a Database onto the canvas.",
      successMessage: "Database added",
      objective: { kind: "node", componentType: "database" },
    },
    {
      id: 5,
      title: "Connect API Server to Database",
      description: "Connect your backend to persistent storage.",
      instruction: "Connect the API Server to the Database.",
      successMessage: "Connection created",
      objective: {
        kind: "edge",
        sourceType: "server",
        targetType: "database",
        feedbackRules: [
          {
            sourceType: "database",
            targetType: "server",
            title: "Try reversing that connection.",
            explanation:
              "The API server sends requests to the database when it needs to read or store data.",
          },
          {
            sourceType: "client",
            targetType: "database",
            title: "Keep the database behind your backend.",
            explanation:
              "Clients typically access application data through the API server rather than connecting directly to the database.",
          },
        ],
      },
    },
  ],
};
