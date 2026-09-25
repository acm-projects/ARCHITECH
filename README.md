# Architech 🏗️

<p align="center"><img width="400" height="305" alt="ezgif-1eec739d30787784" src="https://github.com/user-attachments/assets/cf28c13e-ec35-46fb-96c3-9abc60bec640" /></p>

---

> Build systems. Break systems. Learn to think like an architect.

Architech is an interactive system design and software architecture learning platform that turns abstract architecture concepts into hands-on, consequence-driven challenges.

Users build software systems on a visual drag-and-drop canvas, connect components, swap technologies, and watch metrics like cost, scalability, reliability, and latency change in real time. An AI architect then critiques their design, identifies risks, and explains the tradeoffs behind their decisions.

Instead of memorizing the "right" architecture, Architech gives users a space to **experiment, make mistakes, and understand why architectural decisions matter.**

---

# ✨ Why Architech?

---

System design is difficult to learn because most resources are passive. Students can watch lectures, read case studies, or practice interview questions, but rarely get to actually **build and break systems themselves**.

Architech solves this by:

* Turning system design into an interactive experience
* Letting users visually construct architectures
* Showing the consequences of architectural decisions in real time
* Allowing users to experiment with different technologies
* Identifying architectural risks and failure points
* Using AI to provide contextual feedback
* Reinforcing learning through post-design reviews

---

# 🧩 MVP Features

## 1️⃣ Interactive Architecture Canvas
---

* Drag and drop architecture components onto a visual canvas
* Connect components to define system flow
* Curated component library including:

  * Frontend
  * Backend
  * Database
  * Cache
  * Queue
  * CDN
  * Load Balancer
  * Authentication
* Configure individual components
* Save and load architecture designs

## 2️⃣ Live Architecture Metrics
---

* Display real-time architecture metrics
* Track:

  * Estimated cost
  * Scalability
  * Reliability
  * P95 latency
* Update metrics as components are added, removed, or connected
* Highlight potential bottlenecks and risks directly on the architecture

## 3️⃣ Technology Swapping
---

* Swap the implementation behind any architecture component
* Compare different technologies and their tradeoffs
* Example comparisons:

  * PostgreSQL vs. MongoDB
  * Redis vs. Memcached
* Recalculate architecture metrics based on implementation choices
* Help users understand that architectural decisions involve tradeoffs rather than universally "correct" answers

## 4️⃣ AI Architect
---

* AI-powered chat sidebar
* Analyze the current architecture and its metrics
* Identify potential risks and failure points
* Ask follow-up questions about design decisions
* Suggest architectural improvements
* Explain tradeoffs between different approaches
* Provide contextual feedback based on the actual architecture

Example:

> ⚠️ **Risk:** Payments have no fallback if Stripe becomes unavailable.

## 5️⃣ Architecture Review
---

* Generate a summary of the completed architecture
* Highlight major design decisions
* Identify key risks and bottlenecks
* Summarize important tradeoffs
* Provide key lessons learned
* Give users a final review of their system

---

# 🌱 Stretch Goals
---

## Challenge Mode

Remove the curated component palette and give users a freeform whiteboard-style environment.

This simulates a real system design interview where users must determine the architecture themselves.

## Reverse Mode

* Paste a GitHub repository URL
* Parse the codebase
* Identify major application components
* Automatically generate an architecture diagram
* Visualize the architecture of a real-world codebase

---

# 🗺️ Development Timeline


| **Week**   | **Frontend**                                                                                                                                 | **Backend**                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Week 1** | Project setup, Next.js + TypeScript + Tailwind configuration, React Flow setup, initial wireframes for canvas, metrics panel, and AI sidebar | PostgreSQL setup, project/environment configuration, initial database schema                                                   |
| **Week 2** | Draggable architecture nodes, node connections, component configuration panel, implementation swapping UI                                    | Component library data model, implementation variants, base cost/latency/reliability/scalability values, design save/load CRUD |
| **Week 3** | Live metrics panel connected to canvas state, architecture metric displays                                                                   | Metrics calculation engine, weighted graph model, cost and scalability calculations                                            |
| **Week 4** | Visual risk indicators on nodes/edges, real-time metric updates and architecture feedback                                                    | Reliability and P95 latency calculations, graph traversal logic, unit tests against reference architectures                    |
| **Week 5** | AI Architect chat sidebar, message UI, streaming responses                                                                                   | OpenAI/Anthropic API integration, structured prompts using graph JSON + architecture metrics                                   |
| **Week 6** | AI suggestion UI, "Apply Suggestion" interactions, contextual architecture feedback                                                          | Deterministic architecture pre-checks, risk detection, suggested fixes, caching and rate limiting                              |
| **Week 7** | Review/summary screen, onboarding flow, loading and empty states, responsive/accessibility pass                                              | Authentication, metrics engine edge cases, disconnected components/cycles/missing tiers, save/load performance                 |
| **Week 8** | Final UI polish, demo architecture flows, error handling                                                                                     | Integration testing, bug fixes, performance testing, deployment                                                                |
| **Week 9** | Final demo preparation, presentation polish, rehearsal                                                                                       | Final integration verification, stability testing, demo environment preparation                                                |

---

# 🛠️ Tech Stack

---

## Frontend

---

* Next.js
* React
* TypeScript
* Tailwind CSS
* React Flow
* Figma

## Backend

---

* Node.js
* PostgreSQL
* WebSockets or polling for live metric updates

## AI & APIs

---

* OpenAI API or Anthropic API
* GitHub REST API *(Reverse Mode)*

## Tools

---

* GitHub
* VS Code
* Figma

---

# 🚧 Roadblocks & Possible Solutions

---

## 1️⃣ Modeling Architecture Metrics

---

Real-world architecture tradeoffs are highly context-dependent, making it difficult to produce perfectly accurate cost, scalability, reliability, and latency estimates.

**Solution:**

Use a transparent weighted-scoring model with documented assumptions for each component and connection.

The goal is not perfect real-world accuracy, but **directionally correct and explainable estimates** that help users understand tradeoffs.

## 2️⃣ AI Critique Quality

---

Generic LLM responses can be vague or fail to identify the specific architectural problem in a user's design.

**Solution:**

Use deterministic pre-checks to identify known architecture issues, such as:

* Single points of failure
* Missing retries
* Missing fallbacks
* Hot database paths
* Disconnected components

The AI receives these structured results alongside the architecture graph and metrics, allowing it to focus on explaining the problem and providing useful feedback.

## 3️⃣ Canvas & Real-Time Performance

---

Metrics need to update quickly as users drag, connect, and modify components.

**Solution:**

* Keep the metrics engine as a pure function over the graph JSON
* Perform calculations client-side where possible
* Debounce expensive recalculations
* Avoid unnecessary backend requests
* Memoize repeated calculations

---

# 📚 Architech Learning Resources

---

To go from zero to building Architech.

---

## Frontend (Next.js, React, TypeScript, Tailwind)
---

* [React JS Crash Course](https://www.youtube.com/watch?v=w7ejDZ8SWv8) – Components, state, props, and building interactive UIs.
* [TypeScript React Tutorial](https://www.youtube.com/watch?v=WBPrJSw7yQA) – TypeScript fundamentals and integration with React.
* [Next.js Tutorial](https://www.youtube.com/watch?v=ZVnjOPwW4ZA) – Routing, layouts, server components, and application structure.
* [Tailwind CSS Tutorial](https://www.youtube.com/watch?v=dFgzHOX84xQ) – Utility-first CSS and responsive UI development.
* [React Flow Tutorial](https://www.youtube.com/watch?v=EvgdirLeYaQ) – Build interactive node-based diagrams and workflows.

---

## Backend (Node.js, PostgreSQL)
---

* [Node.js Tutorial](https://www.youtube.com/watch?v=TlB_eWDSMt4) – Backend fundamentals, modules, and server-side JavaScript.
* [PostgreSQL Full Course](https://www.youtube.com/watch?v=qw--VYLpxG4) – Tables, queries, relationships, and CRUD operations.
* [REST API Crash Course](https://www.youtube.com/watch?v=Q-BpqyOT3a8) – Build APIs for frontend/backend communication.
* [WebSockets Tutorial](https://www.youtube.com/watch?v=pnj3Jbho5Ck) – Real-time communication between clients and servers.

---

## System Design & Architecture
---

* Learn the fundamentals of distributed systems
* Study common architecture patterns
* Understand scalability and reliability
* Learn about caching, queues, load balancing, and CDNs
* Practice identifying single points of failure
* Compare database and infrastructure tradeoffs
* Study real-world system design case studies

---

## AI / LLM Integration
---

* [OpenAI API Tutorial](https://www.youtube.com/watch?v=Cpfat3o6eSs) – Learn how to integrate an LLM into an application.
* Learn structured prompting and JSON-based model outputs
* Explore prompt engineering for contextual critique
* Learn how to combine deterministic logic with LLM-generated explanations

---

## Git & GitHub
---

* [Git & GitHub Crash Course](https://www.youtube.com/watch?v=RGOj5yH7evk) – Version control, branches, commits, and pull requests.
* [Git Tutorial](https://www.youtube.com/watch?v=mJ-qvsxPHpY) – Git fundamentals and collaborative workflows.

---

## ✅ Suggested Learning Path
---

1. HTML → CSS → JavaScript
2. React → TypeScript → Tailwind → Next.js
3. Node.js → REST APIs → PostgreSQL
4. React Flow → Interactive graph/canvas development
5. System design fundamentals → Distributed systems → Architecture patterns
6. Graph algorithms → Architecture metrics engine
7. OpenAI/Anthropic API → Structured prompting → AI Architect
8. WebSockets → Real-time updates
9. Git → GitHub → Collaborative development

---

# 👥 Meet the Team
---
* Juan C. Sanchez - Full-stack
Built by students through **ACM Projects at UT Dallas**.
* Shivam Singh (full stack)