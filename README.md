# ArchHub

A free toolkit for architecture students. Built with Next.js and Tailwind CSS.

## What is in each folder

| Folder / file | What it is | Should I edit it? |
| --- | --- | --- |
| `content/` | The words and lists shown on the site, stored as simple JSON files. | **Yes — this is where you edit content.** |
| `content/home.json` | The home page: tagline, intro, the four sections and the cards inside them. | Yes |
| `content/scales.json` | The preset scales shown in the Scale Converter. | Yes |
| `content/concepts.json` | The Concept Planner's lists: project types, climates and their strategies, design drivers. | Yes |
| `lib/` | Small helpers shared by the tools (saving work in the browser, downloading files). | Rarely |
| `app/studio/plan/` | The Floor Plan Studio page (`/studio/plan`). | Rarely |
| `components/plan/` | The studio itself: the workspace, the drawing, and the side-panel controls. | Rarely |
| `lib/plan/styles.ts` | The render styles (Technical, Blueprint, Presentation: sage, and so on). Copy a block to add a style. | To add or recolour styles |
| `lib/plan/furniture.ts` | The furniture library. Copy a block to add an item. | To add furniture |
| `lib/plan/types.ts` | The lists of door, window, tree and floor-finish types, and wall thicknesses. | To add types |
| `lib/plan/geometry.ts`, `lib/plan/dxf.ts` | The measuring maths and the DXF import/export. | No |
| `app/` | The pages. Each folder is a web address (`app/tools/scale-converter` is `/tools/scale-converter`). | Only when adding or changing pages |
| `app/page.tsx` | The home page layout. | Rarely |
| `app/layout.tsx` | The header and footer that wrap every page. | Rarely |
| `app/globals.css` | The site colours (paper, ink, blueprint blue) for light and dark mode. | To change colours |
| `components/` | Reusable building blocks, like the Scale Converter. | Rarely |
| `public/` | Images and files that visitors can download. | To add images |
| `node_modules/`, `.next/` | Downloaded and generated files. | Never — they are recreated automatically |
| `package.json` | The list of tools the project uses. | No |

## Editing content on GitHub's website

1. Open the file (for example `content/home.json`) on GitHub.
2. Click the pencil icon, change the text between the quotation marks, and click **Commit changes**.
3. Vercel rebuilds the site automatically; the change is live in about a minute.

To add a card to the home page, copy an existing block in `content/home.json`:

```json
{
  "title": "Area Calculator",
  "description": "Work out room and site areas.",
  "status": "soon"
}
```

Use `"status": "live"` together with `"href": "/your-page"` once the page exists.
Keep the commas between blocks, and no comma after the last one.

## Running the site on your computer

```bash
npm run dev
```

Then open http://localhost:3000 in your browser.
