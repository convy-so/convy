# Convy Design Language (V2)

Inspired by modern, minimalist SaaS interfaces (Notion, Framer, Linear), this document defines the aesthetic principles for the Convy UI renovation.

## Core Principles

1.  **High Contrast Typography**: Clear hierarchy using bold weights for headings and medium/regular for body text. Use `text-slate-950` for primary text and `text-slate-500` for secondary metadata.
2.  **Flat & Clean**: Minimal use of shadows. Prefer subtle borders (`border-slate-100`) and solid white backgrounds (`bg-white`) for content containers.
3.  **Rounded Geometry**: Large corner radii (16px to 24px) for cards and inputs to create a friendly, accessible feel.
4.  **Information Density**: Clean spacing with generous padding (p-5 or p-6) to ensure content remains readable and scannable.
5.  **Contextual Actions**: Buttons should be clearly mapped to their priority (Primary: `bg-slate-950`, Secondary: `border-slate-200`, Danger: `bg-rose-50 text-rose-700`).

## Component Blueprints

### 1. The Content Card
- **Background**: `bg-white`
- **Border**: `1px solid #f1f5f9` (slate-100)
- **Radius**: `rounded-2xl` or `rounded-[24px]`
- **Header**: Subtle text eyebrow in uppercase-tracking-wide for category labels.

### 2. The Form Layout
- **Inputs**: Full width, `rounded-xl`, `border-slate-100`, soft hover states.
- **CTAs**: Aligned consistently (usually bottom-right or full-width at the bottom of the form).

### 3. The Empty State
- **Icon**: Large, muted color (slate-200).
- **Heading**: Directly address the "missing" item.
- **Description**: Explain *why* the user should create it or what benefit it brings.
- **Action**: Primary button immediately below the description.

## Target Revamps

### Classrooms (Teacher Workspace)
- **Problem**: Current UI is "too simple" or uses heavy glassmorphism that feels disconnected from the survey dashboard.
- **Solution**: Switch to the "Flat Card" system. Use the integrations-style grid for classroom listings.

### Departments (Team Management)
- **Problem**: Form and list feel separate and basic.
- **Solution**: Unify the "Create Department" and "List" into a cohesive view that feels like a directory, matching the "Campaigns" detail view (Image 1).
