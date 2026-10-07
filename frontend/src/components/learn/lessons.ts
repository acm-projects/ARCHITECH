import type {
  ConnectionFeedback,
  ConnectionFeedbackRule,
  LearnObjective,
} from "../../lib/architecture/learn/objectives.ts";

// What the canvas must contain for a step to count as done. Objectives refer to component
// types, never labels or node ids, so renamed nodes still count. They are defined, and
// checked, in lib/architecture/learn.
export type { ConnectionFeedback, ConnectionFeedbackRule };
export type LessonObjective = LearnObjective;

export type LessonStep = {
  id: number;
  title: string;
  // Why this step matters.
  description: string;
  // What to do.
  instruction: string;
  // Shown briefly when the objective is met.
  successMessage: string;
  // Why it worked, shown with the success message.
  successExplanation: string;
  objective: LessonObjective;
};

export type Lesson = {
  id: string;
  title: string;
  // The finished architecture, shown on the completion state.
  summary: string;
  steps: LessonStep[];
};

// Shown once the tutorial is finished (see learnPhase in lib/architecture/learn/session). Plain
// copy: the design pass restyles it.
export const FREE_PLAY_TITLE = "It's your turn!";
export const FREE_PLAY_BODY =
  "You've learned the basics. Now experiment with your architecture, change components and properties, and run your system to see how your decisions affect it.";

export const firstWebSystemLesson: Lesson = {
  id: "first-web-system",
  title: "Build Your First Web System",
  summary: "Client → API Server → Database, with a Cache and two API Servers",
  steps: [
    {
      id: 1,
      title: "Add a Client",
      description:
        "Every system starts with someone using it. The client is the browser or app that sends requests.",
      instruction: "Drag Client from Components onto the canvas.",
      successMessage: "Client added",
      successExplanation: "Requests have to start somewhere: the client is where every request in your system begins.",
      objective: { kind: "node", componentType: "client" },
    },
    {
      id: 2,
      title: "Add an API Server",
      description:
        "The API server receives requests and runs your application logic.",
      instruction: "Drag an API Server onto the canvas.",
      successMessage: "API Server added",
      successExplanation:
        "Your logic needs somewhere to run, apart from the client, so you can change and scale it on its own.",
      objective: { kind: "node", componentType: "server" },
    },
    {
      id: 3,
      title: "Connect Client to API Server",
      description: "Requests need a path from the client to your backend.",
      instruction:
        "Drag from the Client's right handle to the API Server's left handle.",
      successMessage: "Connection created",
      successExplanation:
        "Now a request can travel from a user to your code. The arrow shows which way requests flow.",
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
      description:
        "Your application needs somewhere to persist data. A server forgets everything when it restarts.",
      instruction: "Drag a Database onto the canvas.",
      successMessage: "Database added",
      successExplanation: "A database keeps your data safe even when servers come and go.",
      objective: { kind: "node", componentType: "database" },
    },
    {
      id: 5,
      title: "Connect API Server to Database",
      description:
        "Connect your backend to persistent storage, so it can read and store data.",
      instruction: "Connect the API Server to the Database.",
      successMessage: "Connection created",
      successExplanation:
        "Only your server talks to the database, which keeps access to your data in one place you control.",
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
    {
      id: 6,
      title: "Add a Cache",
      description:
        "Most systems read data far more often than they change it. A cache keeps frequently read data in fast memory, so the database is asked less often.",
      instruction: "Drag a Cache onto the canvas.",
      successMessage: "Cache added",
      successExplanation:
        "A cache can answer repeated reads without bothering the database, which makes reads faster and takes load off it.",
      objective: { kind: "node", componentType: "cache" },
    },
    {
      id: 7,
      title: "Put the Cache in the Read Path",
      description:
        "A cache only helps if requests can reach it. Your server should check the cache before it asks the database.",
      instruction: "Connect the API Server to the Cache.",
      successMessage: "Cache connected",
      successExplanation:
        "Now the server can ask the cache first. Reads it can answer never reach the database.",
      objective: {
        kind: "edge",
        sourceType: "server",
        targetType: "cache",
        feedbackRules: [
          {
            sourceType: "cache",
            targetType: "server",
            title: "Try reversing that connection.",
            explanation:
              "The API server asks the cache for data, so the connection goes from the server to the cache.",
          },
          {
            sourceType: "client",
            targetType: "cache",
            title: "Put the cache behind the API server.",
            explanation:
              "Clients talk to your API server, and the server decides when to use the cache.",
          },
        ],
      },
    },
    {
      id: 8,
      title: "Run More Than One Server",
      description:
        "If your only server fails, everything stops. Running two copies means the system keeps working when one of them fails.",
      instruction: "Select the API Server, open Configure, and set Replicas to 2.",
      successMessage: "Server is redundant",
      successExplanation:
        "With two copies, either one can fail and requests still get answered. This is redundancy, the basis of a reliable system.",
      objective: { kind: "redundancy", componentType: "server", minInstances: 2 },
    },
  ],
};
