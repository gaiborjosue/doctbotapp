# Next.js template

This is a Next.js template with shadcn/ui.

## Audio processing

Authenticated audio uploads are stored privately in Cloudflare R2. After an
upload is verified, the server creates a one-hour signed read URL and submits it
directly to a foreground Gemini Interaction; Gemini Files API and inline base64
input are not used. The Interaction ID, status, Spanish summary, and error state
are stored in `public.docbot_processing_jobs` and protected by per-user RLS.

Copy `.env.example` to `.env.local` and configure the Supabase, R2, and Gemini
server credentials. `GEMINI_API_KEY` and every R2 credential must remain
server-only. The default audio model is `gemini-2.5-flash`. Signed URL audio input
is limited to 100 MB, so upload validation uses the same limit.

## Session chat

Each completed audio-processing job creates a DocBot session. Its canonical
Gemini summary is injected server-side as the session agent's source context;
the browser sends only the session ID and the newest user message. AI SDK streams
Gemini responses into the existing AI Elements conversation, and finalized
`UIMessage` parts are stored in `public.docbot_session_messages` behind per-user
RLS so history survives reloads and devices.

`GEMINI_CHAT_MODEL` controls the chat model and defaults to
`gemini-2.5-flash`. It uses the same server-only `GEMINI_API_KEY` as audio
processing.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```

## Generating avatar definitions

Convert every avatar in a Bible Strong Avatar Studio project into an individual,
runtime-validated definition:

```bash
pnpm avatars:generate -- /absolute/path/to/avatar-studio-project.json
```

By default, `app/docbot.avatar.json` is the behavior template and generated files
are written to `lib/avatars/definitions`. Every avatar receives the template's
complete expression and animation set, adjusted to its own neutral eye geometry.

The optional second and third arguments select another behavior template and output
directory:

```bash
pnpm avatars:generate -- project.json template.avatar.json output/directory
```
