# Digital Garden — Expanded Project Concept

A digital garden / personal wiki for collecting, developing, and sharing knowledge over time. Unlike a traditional blog, where posts are published as finished articles in chronological order, a digital garden is a living collection of interconnected notes that can evolve as your understanding changes.

## Core principles

- Atomic notes: Each note focuses on one idea, concept, question, insight, or observation.
- Interconnected knowledge: Notes link to related notes, forming a network of ideas rather than an isolated collection of documents.
- Continuous growth: Notes can be incomplete, revised, expanded, merged, or eventually retired. The garden is never truly finished.
- Private by default: Notes can remain personal or be explicitly marked for public sharing.
- Selective publishing: Public notes are published to a website, while private notes and personal drafts remain accessible only to you.
- Knowledge over chronology: Organize and discover ideas through topics, backlinks, tags, and relationships instead of relying primarily on publication dates.
- Progressive refinement: Ideas can evolve from rough thoughts into developed explanations as you learn more.

## Core features

### 1. Note creation and editing

- Create, edit, archive, and delete notes.
- Support Markdown for formatting, code snippets, lists, and links.
- Assign each note a title, unique identifier, tags, and optional metadata.
- Make capturing a new thought quick and frictionless.

### 2. Knowledge graph

- Link notes using internal links, such as `[[Artificial Intelligence]]`.
- Automatically detect backlinks and show which notes reference the current note.
- Explore relationships through a visual graph.
- Identify isolated notes that could benefit from connections.

### 3. Note lifecycle

Notes should be allowed to mature naturally rather than follow a mandatory publishing workflow.

Possible maturity states:

- Seed: A raw idea or incomplete thought.
- Growing: An idea being explored, with links and supporting information.
- Evergreen: A well-developed note that has been refined over time.
- Archived: A note retained for reference but no longer actively maintained.

These states describe the development of an idea, not whether it is public.

### 4. Privacy and publishing

- Private notes are the default.
- Each note has an explicit visibility setting: private or public.
- Publish selected notes to a public-facing website.
- Keep private notes, private metadata, and unpublished content out of public pages and search indexes.
- Allow public notes to link to other public notes without exposing private content.
- Support unpublishing a note when necessary.

### 5. Discovery and navigation

- Full-text search across personal notes.
- Browse by tags, topics, and note status.
- View backlinks and related notes.
- Navigate through a topic index or curated entry points.
- Provide a public garden homepage with selected notes and topic collections.

## Suggested initial scope (MVP)

Start with a small, dependable system rather than building a full knowledge-management platform.

| Feature         | Initial implementation                     |
| --------------- | ------------------------------------------ |
| Notes           | Markdown files                             |
| Organization    | Folders, tags, and metadata                |
| Linking         | Internal links and backlinks               |
| Editing         | Simple editor with Markdown support        |
| Search          | Full-text search                           |
| Visibility      | Private by default; explicit public status |
| Publishing      | Static website generation for public notes |
| Lifecycle       | Seed, growing, evergreen, archived         |
| Version history | Git                                        |
| Hosting         | Static hosting for the published garden    |

## Guiding idea

The project should optimize for capturing thoughts, connecting ideas, and growing understanding over time — not for producing polished content or maintaining a perfectly organized archive.

A note does not need to be complete to be useful, and publishing should be a deliberate choice rather than a requirement.

Success means that, over months and years, the garden becomes an increasingly useful representation of what you know, what you are learning, and how your ideas connect.
