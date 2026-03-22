---
name: Usability & UX Research (Analytics)
description: Analytics agent skill for interpreting Usability & UX Research. Focuses on calculating task completion rates, isolating navigation bottlenecks, and distinguishing subjective aesthetic preferences from objective usability failures.
id: dp-usability-ux-analytics
version: 1.0.0
---

# Section 1: What This Domain's Data Actually Means
Usability data is binary at its core: The user either completed the task, or they didn't. The Analytics agent must strip away the user's subjective opinions (e.g., "I like the blue color") and focus entirely on the behavioral friction (e.g., "It took 4 minutes to find the blue button"). If users rate a prototype highly for "look and feel" but systematically fail to complete the checkout flow, the Analytics agent must ruthlessly flag the design as a failure. Good UI is invisible; UX data surfaces where the UI became suddenly, painfully visible.

# Section 2: Coverage Interpretation Guide
**The Usability Matrix:**
- High Completion, Low Friction: The design is invisible and works perfectly.
- High Completion, High Friction: The user succeeded, but only through stubbornness. Requires immediate streamlining.
- Low Completion, Low Friction: The "Silent Failure." The user confidently clicked the wrong thing, thinking they succeeded. The most dangerous state.
- Low Completion, High Friction: Complete design failure. Requires immediate overhaul.

# Section 3: Quality Weighting Rules
**The 'Silent Failure' Multiplier:** If a user completes a task incorrectly but believes they did it correctly (e.g., they accidentally deleted a file when they thought they were saving it), this data point is weighted at 5x. An interface that lies to the user is a critical liability.

# Section 4: Benchmark Context
**The 'Tech-Savvy' Adjustment:** The Analytics agent must index the severity of a failure against the user's digital literacy. If a highly technical "Power User" cannot figure out the navigation, the design is catastrophically broken. If a self-proclaimed "Luddite" struggles, the friction is noted but weighted slightly lower for mass-market applications.

# Section 5: Output Format Specification
**Section 1: Study Parameters**
Prototype fidelity tested, devices used, predefined tasks.
**Section 2: Executive Summary**
The definitive pass/fail rate for the core UI workflows.
**Section 3: Task Completion & Bottleneck Report**
A chronological breakdown of exactly where the UI failed during the assigned tasks.
**Section 4: Information Architecture & Labeling Analysis**
Diagnosis of confusing terminology, hidden menus, or broken visual hierarchies.
**Section 5: Decision Map Response**
Direct mapping to the specific wireframe shifts, naming convention updates, or flow redesigns requested in the brief.
**Section 6: Limitations and Confidence Notes**
Required section.

# Section 6: Multi-Session Analysis Guide
Analyze for the "Desire Path." If 60% of users ignore the giant 'Get Started' button and instead try to click a tiny hyperlink in the footer to achieve their goal, the Analytics agent must flag this as the true user intent (the desire path) and recommend the UX team elevate that link into the primary workflow.

# Section 7: Flagging and Limitation Language
**When a 'Silent Failure' pattern is detected:**
"Synthesis of the task execution reveals a critical 'Silent Failure' loop within the [Specific Workflow]. While [Percentage]% of respondents reported that they successfully completed the task, behavioral tracing shows they actually executed [Incorrect Action] instead. This occurred primarily because the system provided a 'Success' confirmation state that did not align with the user's actual intent. This is a severe interface liability that will result in massive downstream data errors and customer support volume. We strongly advise an immediate redesign of the success-confirmation logic."
