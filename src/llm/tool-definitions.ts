import type { AgentTool } from "../types";

export const AGENT_TOOLS: AgentTool[] = [
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Search DuckDuckGo for penetration testing information. Use advanced operators for precision.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              `Advanced search query. Use operators: site:, intitle:, after:, "exact phrase". Add site:github.com, site:book.hacktricks.xyz, site:ired.team, site:exploit-db.com as appropriate. For recency use after:${new Date().getFullYear() - 1}-01-01 to filter results from ${new Date().getFullYear() - 1} onward.`,
          },
          num_results: {
            type: "number",
            description: "Number of results to return. Default 5, maximum 10.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crawl_url",
      description:
        "Visit a URL and extract its full text content. Use this to verify facts, get exact command syntax, and read source material before writing to a note.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Full URL starting with https://",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_note",
      description:
        "Read the full current content of a note. Always call this before patching it so you have the latest version.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path, e.g. Pentest/Recon.md",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "patch_note_section",
      description:
        "Surgically replace the body of a specific section (identified by its heading) in a note. The heading line itself is preserved; only the content below it is replaced. If the heading does not exist, a new section is appended. Use this for targeted edits — NOT for full rewrites. Always call read_note first.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path to the note",
          },
          heading: {
            type: "string",
            description: "Exact heading text WITHOUT the # symbols, e.g. 'Port Scanning' or 'Privilege Escalation'",
          },
          new_body: {
            type: "string",
            description: "The new Markdown content body to place under that heading. Full well-formed Markdown.",
          },
          heading_level: {
            type: "number",
            description: "Heading level 1-6 used ONLY when creating a new section. Default 2.",
          },
        },
        required: ["path", "heading", "new_body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_note_bullet",
      description:
        "Add a new bullet point to a section, or replace an existing bullet that matches a provided keyword. Use this for precise single-point additions or corrections within a list — avoids touching the rest of the section. Always call read_note first.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path to the note",
          },
          heading: {
            type: "string",
            description: "Exact heading text WITHOUT # symbols identifying where to add the bullet",
          },
          bullet_text: {
            type: "string",
            description: "Full text of the bullet point WITHOUT the leading dash, e.g. '`nmap -sV -p 443` — service version detection on HTTPS'",
          },
          match_prefix: {
            type: "string",
            description: "Optional: partial text of an existing bullet to find and replace. If omitted, new bullet is appended to the section.",
          },
        },
        required: ["path", "heading", "bullet_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_to_note",
      description:
        "Write Markdown content to a note. Prefer patch_note_section or upsert_note_bullet for surgical edits. Use this only for append (add to end) or full replace when the entire note needs rewriting.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path to the note file",
          },
          content: {
            type: "string",
            description: "Markdown content to write",
          },
          mode: {
            type: "string",
            enum: ["append", "prepend", "replace"],
            description:
              "append: add to end. prepend: add to start. replace: overwrite entire note (use sparingly).",
          },
        },
        required: ["path", "content", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Create a brand new Markdown note at the specified path with initial content.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Full vault-relative path including .md extension",
          },
          content: {
            type: "string",
            description: "Initial Markdown content",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_vault_notes",
      description: "List notes matching an optional tag or folder prefix.",
      parameters: {
        type: "object",
        properties: {
          tag: {
            type: "string",
            description: "Filter by tag name without the # symbol",
          },
          folder: {
            type: "string",
            description: "Filter by folder path prefix, e.g. Pentest",
          },
        },
        required: [],
      },
    },
  },
];
