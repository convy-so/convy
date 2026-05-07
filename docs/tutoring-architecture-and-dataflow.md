# Tutoring Feature Data Flow & Architecture

This document complements `docs/tutoring-feature-file-inventory.md` with two system diagrams:
1) end-to-end data flow from UI to database, and
2) architecture with emphasis on expert-knowledge integration.

## 1) End-to-End Data Flow (UI → API → Domain Services → DB)

```mermaid
flowchart TD
    UIStudent[Student UI\ncomponents/learning/student-learning-home.tsx] --> HookStudent[Hook\nuse-student-learning-workspace]
    UITeacher[Teacher UI\ncomponents/learning/teacher-learning-home.tsx\nteacher-topic-detail-page.tsx] --> HookTeacher[Hook\nuse-teacher-learning-workspace]

    HookStudent --> ClientAPI[Client API\nlib/api/learning.ts]
    HookTeacher --> ClientAPI
    ClientAPI --> APIRoutes[Route Handlers\napp/api/learning/**]

    APIRoutes --> Access[Access & Auth Checks\nlib/learning/access.ts]
    APIRoutes --> Orchestrator[Tutoring Route Orchestrator\nlib/learning/tutoring-route-orchestrator.ts]

    Orchestrator --> Runtime[Tutor Runtime\nlib/learning/tutor-runtime-service.ts]
    Runtime --> Prompting[Tutoring Prompt Service\nlib/learning/tutoring-prompt-service.ts\nlib/learning/prompts/*]
    Runtime --> StudentModel[Student Model Service\nlib/learning/student-model-service.ts]
    Runtime --> ContentScope[Content Scope\nlib/learning/content-scope-service.ts\nmaterials.ts]

    APIRoutes --> Lifecycle[Session Lifecycle\nlib/learning/tutoring-session-lifecycle.ts]
    APIRoutes --> Reporting[Reporting\nlib/learning/reporting.ts]

    Access --> Storage[Storage Layer\nlib/learning/storage.ts]
    Orchestrator --> Storage
    Runtime --> Storage
    Lifecycle --> Storage
    Reporting --> Storage
    StudentModel --> Storage

    Storage --> DB[(Postgres via Drizzle\ndb/schema/learning.ts)]

    APIRoutes --> WorkerQueue[Async Work Trigger]
    WorkerQueue --> TutoringWorker[workers/tutoring-report.worker.ts]
    TutoringWorker --> Storage
```

### Notes
- Student tutoring turns originate in the student workspace UI and hit `/api/learning/topics/[topicId]/chat`.
- Teacher analytics/report views originate in teacher workspace components and hit reports/overview/pattern endpoints.
- Domain services centralize prompt/runtime/session orchestration before persistence.

## 2) Architecture Diagram (with Expert Integration Focus)

```mermaid
flowchart LR
    subgraph Presentation
      StuUI[Student Learning UI]
      TeachUI[Teacher Learning UI]
      ExpertUI[Expert Console UI\ncomponents/expert/*]
    end

    subgraph API
      LearnAPI[Learning APIs\napp/api/learning/**]
      ExpertAPI[Expert APIs\napp/api/learning/expert/**]
    end

    subgraph CoreLearningDomain[Core Learning Domain]
      TutorRuntime[Tutor Runtime Service]
      PromptSvc[Tutoring Prompt Service]
      SessionEngine[Session Engine]
      StudentModelSvc[Student Model Service]
      EvidenceSvc[Evidence / RAG]
      ReportSvc[Reporting Service]
    end

    subgraph ExpertKnowledgeSystem[Expert Knowledge System]
      ReviewQueue[Expert Review Queue]
      Annotations[Expert Annotations]
      Assets[Expert Assets & Versions]
      Baselines[Eval Baseline Bootstrap]
      Crystallization[Crystallization Prompts]
      PromptPacks[Prompt/Heuristic Packs]
    end

    subgraph Persistence
      Store[learning/storage.ts]
      DB[(db/schema/learning.ts + related tables)]
    end

    StuUI --> LearnAPI
    TeachUI --> LearnAPI
    ExpertUI --> ExpertAPI

    LearnAPI --> TutorRuntime
    LearnAPI --> ReportSvc
    ExpertAPI --> ReviewQueue
    ExpertAPI --> Annotations
    ExpertAPI --> Assets
    ExpertAPI --> Baselines

    TutorRuntime --> PromptSvc
    TutorRuntime --> SessionEngine
    TutorRuntime --> StudentModelSvc
    TutorRuntime --> EvidenceSvc

    %% Expert integration path into live tutoring
    ReviewQueue --> Crystallization
    Annotations --> Crystallization
    Baselines --> Crystallization
    Crystallization --> PromptPacks
    Assets --> PromptPacks
    PromptPacks --> PromptSvc

    PromptSvc --> Store
    SessionEngine --> Store
    StudentModelSvc --> Store
    ReportSvc --> Store
    ReviewQueue --> Store
    Assets --> Store
    Store --> DB
```

### How expertise is integrated into tutoring behavior
1. **Experts review real tutoring transcripts/interactions** via expert endpoints and UI queue tools.
2. **Experts annotate failures/corrections** and curate improved pedagogical guidance.
3. **Crystallization transforms reviewed feedback into reusable heuristics/prompt assets**.
4. **Versioned expert assets are activated** and made available to tutoring prompt assembly.
5. **Tutor runtime consumes updated prompt packs** in subsequent student sessions, changing live tutoring behavior.

## Source map for diagram nodes
- Student/Teacher UI: `components/learning/*`, `components/learning/hooks/*`
- Expert UI: `components/expert/*`
- Learning APIs: `app/api/learning/**`
- Expert APIs: `app/api/learning/expert/**`
- Core services: `lib/learning/tutor-runtime-service.ts`, `lib/learning/tutoring-prompt-service.ts`, `lib/learning/session-engine.ts`, `lib/learning/student-model-service.ts`, `lib/learning/rag.ts`, `lib/learning/reporting.ts`
- Persistence: `lib/learning/storage.ts`, `db/schema/learning.ts`
- Async: `workers/tutoring-report.worker.ts`
