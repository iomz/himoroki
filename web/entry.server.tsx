import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext } from 'react-router';

// Framework Mode renders the SPA shell at build time; Hono serves it at runtime.
export default async function renderShell(
  request: Request,
  status: number,
  headers: Headers,
  context: EntryContext,
) {
  const stream = await renderToReadableStream(
    <ServerRouter context={context} url={request.url} />,
  );
  await stream.allReady;
  headers.set('Content-Type', 'text/html');
  return new Response(stream, { status, headers });
}
