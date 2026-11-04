import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { AssistantReply, ElementCandidate, TourPlan, TourStep } from '../../src/shared/types';

const EXTENSION = join(import.meta.dirname, '../../dist');
const FIXTURES = join(import.meta.dirname, 'fixtures');
const RING_PADDING = 4;

const VAGUE_QUESTION = 'I have a node js backend, where should I deploy it?';

const LAMBDA_TOUR: TourPlan = {
  title: 'Deploy a Node.js backend to Lambda',
  service: 'Lambda',
  steps: [
    { title: 'Open Lambda', instruction: 'Open the **Lambda** console.', action: 'navigate', url: 'https://console.aws.amazon.com/lambda/home' },
    { title: 'Create a function', instruction: 'Click **Create function**.', action: 'click', target: { text: 'Create function', kind: 'button' } },
    { title: 'Start from scratch', instruction: 'Choose **Author from scratch**.', action: 'click', target: { text: 'Author from scratch', kind: 'radio' } },
    { title: 'Name the function', instruction: 'Give your function a name.', action: 'type', target: { text: 'Function name', kind: 'input' }, value: 'my-node-backend' },
    { title: 'Open the runtimes', instruction: 'Open the **Runtime** dropdown.', action: 'click', target: { text: 'Runtime', kind: 'select' } },
    { title: 'Pick Node.js', instruction: 'Choose **Node.js 22.x**.', action: 'click', target: { text: 'Node.js 22.x', kind: 'option' } },
    { title: 'Turn on the URL', instruction: 'Check **Enable function URL**.', action: 'click', target: { text: 'Enable function URL', kind: 'checkbox' } },
    { title: 'Set up triggers', instruction: 'Click **Configure triggers**.', action: 'click', target: { text: 'Configure triggers', kind: 'button' } },
    { title: 'Publish', instruction: 'Click **Publish version**.', action: 'click', target: { text: 'Publish version', kind: 'button' } },
    { title: 'Open monitoring', instruction: 'Open the **Monitor** tab.', action: 'click', target: { text: 'Monitor', kind: 'tab' } },
    { title: 'Create it', instruction: 'Click **Create function**.', action: 'click', target: { text: 'Create function', kind: 'button' } },
    { title: 'Check it worked', instruction: 'You should see a success banner.', action: 'info' },
  ],
};

interface RecordedRequest {
  path: string;
  body: { messages?: Array<{ role: string; content: string }>; candidates?: ElementCandidate[]; step?: TourStep };
}

/** Stands in for the FastAPI backend, with the CORS headers the real one sends to the extension. */
async function startMockBackend() {
  const requests: RecordedRequest[] = [];

  const reply = (request: RecordedRequest): AssistantReply | { id: number | null } => {
    if (request.path === '/resolve') {
      // "Publish version" isn't on the page, but "Deploy now" is what that step means.
      // Every other step gets "nothing fits", like the real resolver would.
      if (request.body.step?.target?.text !== 'Publish version') return { id: null };
      const match = request.body.candidates?.find((candidate) => candidate.label === 'Deploy now');
      return { id: match ? match.id : null };
    }
    const last = request.body.messages?.at(-1)?.content.toLowerCase() ?? '';
    if (last.includes('serverless')) {
      return { type: 'guide', message: 'Let’s deploy it to **AWS Lambda**.', options: [], tour: LAMBDA_TOUR };
    }
    if (last.includes('node')) {
      return {
        type: 'clarify',
        message:
          'Do you want to go **serverless** or run it on a **server**?\n\n' +
          '- **Serverless (AWS Lambda)**: no servers to manage, pay per request.\n' +
          '- **Server (Amazon EC2)**: a virtual machine you control.',
        options: ['Serverless (AWS Lambda)', 'Server (Amazon EC2)'],
        tour: null,
      };
    }
    return { type: 'answer', message: 'An answer.', options: [], tour: null };
  };

  const server: Server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const request: RecordedRequest = { path: req.url ?? '', body: raw ? JSON.parse(raw) : {} };
    requests.push(request);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply(request)));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Serves the mock console pages at real AWS console URLs, so the content script injects as it would in production. */
async function routeConsole(context: BrowserContext) {
  await context.route(/^https:\/\/([\w-]+\.)?console\.aws\.amazon\.com\//, async (route) => {
    const url = new URL(route.request().url());
    const file =
      url.pathname === '/lambda/home'
        ? url.searchParams.get('view') === 'create'
          ? 'lambda-create.html'
          : 'lambda-functions.html'
        : url.pathname === '/lambda/frame'
          ? 'lambda-frame.html'
          : null;
    if (!file) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    return route.fulfill({ path: join(FIXTURES, file), contentType: 'text/html' });
  });
}

/** The spotlight ring should sit exactly around the target (plus its padding). */
async function expectHighlighted(ring: Locator, target: Locator) {
  await expect
    .poll(
      async () => {
        const [r, t] = await Promise.all([ring.boundingBox(), target.boundingBox()]);
        if (!r || !t) return 'missing';
        const close = (a: number, b: number) => Math.abs(a - b) <= 2;
        return close(r.x, t.x - RING_PADDING) &&
          close(r.y, t.y - RING_PADDING) &&
          close(r.width, t.width + 2 * RING_PADDING) &&
          close(r.height, t.height + 2 * RING_PADDING)
          ? 'aligned'
          : `ring ${JSON.stringify(r)} vs target ${JSON.stringify(t)}`;
      },
      { timeout: 20_000 },
    )
    .toBe('aligned');
}

const stepTitle = (page: Page) => page.locator('.card__title');

let context: BrowserContext;
let backend: Awaited<ReturnType<typeof startMockBackend>>;
let extensionId: string;

test.beforeAll(async () => {
  backend = await startMockBackend();
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  await routeConsole(context);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context?.close();
  await backend?.close();
});

test('clarifies a vague question, then walks through the console step by step', async () => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);

  // Point the extension at the mock backend through the settings form.
  await panel.getByRole('button', { name: 'Settings' }).click();
  await panel.getByLabel('Assistant backend URL').fill(backend.url);
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByText('Saved')).toBeVisible();
  await panel.getByRole('button', { name: 'Close' }).click();

  // A vague question gets a counter-question with clickable options.
  await panel.getByRole('textbox', { name: 'Message' }).fill(VAGUE_QUESTION);
  await panel.getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect(panel.getByText('Do you want to go')).toBeVisible();
  await panel.getByRole('button', { name: 'Serverless (AWS Lambda)' }).click();

  // The follow-up carried the conversation, so the backend knew what "Serverless" referred to.
  await expect(panel.getByRole('heading', { name: LAMBDA_TOUR.title })).toBeVisible();
  const followUp = backend.requests.filter((r) => r.path === '/chat').at(-1)!;
  expect(followUp.body.messages?.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  expect(followUp.body.messages?.[1].content).toContain('(Options offered: Serverless (AWS Lambda) | Server (Amazon EC2))');

  // Starting opens the console in a new tab (the panel's own tab isn't an AWS page).
  const [aws] = await Promise.all([
    context.waitForEvent('page'),
    panel.getByRole('button', { name: 'Start walkthrough' }).click(),
  ]);
  await aws.waitForLoadState();
  const ring = aws.locator('.spotlight');

  // Step 1 (open the Lambda console) completes itself because we're already there.
  await expect(stepTitle(aws)).toHaveText('Create a function');
  await expect(panel.getByText('Step 2 of 12: Create a function')).toBeVisible();
  // The visible button, not the screen-reader-only or display:none copies.
  await expectHighlighted(ring, aws.locator('#create-function'));
  await expect(aws.locator('.card__body')).toHaveText('Click Create function.');

  // Clicking the highlighted button advances, and the tour resumes after the page navigates.
  await aws.locator('#create-function').click();
  await aws.waitForURL(/view=create/);
  await expect(stepTitle(aws)).toHaveText('Start from scratch');
  await expectHighlighted(ring, aws.locator('#tile-scratch'));
  await aws.locator('#tile-scratch').click();

  // A field found through its <label>; typing and leaving the field advances.
  await expect(stepTitle(aws)).toHaveText('Name the function');
  await expectHighlighted(ring, aws.locator('#fn-name'));
  await expect(aws.locator('.value code')).toHaveText('my-node-backend');
  await aws.locator('#fn-name').fill('my-node-backend');
  await aws.locator('#fn-name').press('Tab');

  // Dropdown, then an option that only appears after it opens.
  await expect(stepTitle(aws)).toHaveText('Open the runtimes');
  await expectHighlighted(ring, aws.locator('#runtime'));
  await aws.locator('#runtime').click();
  await expect(stepTitle(aws)).toHaveText('Pick Node.js');
  await expectHighlighted(ring, aws.locator('#node22'));
  await aws.locator('#node22').click();

  // Inside a shadow root, next to a visually hidden checkbox.
  await expect(stepTitle(aws)).toHaveText('Turn on the URL');
  await expectHighlighted(ring, aws.locator('#url-label'));
  await aws.locator('#url-label').click();

  // Inside an iframe: that frame shows the step, and the top frame stays out of the way.
  const frame = aws.frameLocator('#triggers');
  await expect(frame.locator('.card__title')).toHaveText('Set up triggers');
  await expectHighlighted(frame.locator('.spotlight'), frame.locator('#configure'));
  await expect(stepTitle(aws)).toHaveCount(0);
  await frame.locator('#configure').click();

  // No element is labelled "Publish version": the backend picks "Deploy now" from the page's elements.
  await expect(stepTitle(aws)).toHaveText('Publish');
  await expectHighlighted(ring, aws.locator('#deploy'));
  await expect(aws.getByText('This is the closest match')).toBeVisible();
  expect(backend.requests.some((r) => r.path === '/resolve')).toBe(true);
  await aws.locator('#deploy').click();

  // Nothing matches at all: the card docks and offers a way forward.
  // "Create function" for the next step is on this page too; the tour must not silently skip ahead.
  await expect(stepTitle(aws)).toHaveText('Open monitoring');
  await expect(aws.getByText(/isn.t on this page yet/)).toBeVisible({ timeout: 20_000 });
  await expect(stepTitle(aws)).toHaveText('Open monitoring');
  await aws.getByRole('button', { name: 'Skip step' }).click();

  // The submit button is far below the fold; it is scrolled into view and chosen over the <h1>.
  await expect(stepTitle(aws)).toHaveText('Create it');
  await expectHighlighted(ring, aws.locator('#submit'));
  await aws.locator('#submit').click();

  await expect(stepTitle(aws)).toHaveText('Check it worked');
  await aws.getByRole('button', { name: 'Finish' }).click();
  await expect(stepTitle(aws)).toHaveText('Walkthrough complete');
  await aws.getByRole('button', { name: 'Done' }).click();
  await expect(aws.locator('.card')).toHaveCount(0);
  await expect(panel.locator('.tour-bar')).toHaveCount(0);
});
