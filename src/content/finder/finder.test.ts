import { afterEach, describe, expect, it } from 'vitest';
import type { TargetSpec } from '../../shared/types';
import { collectCandidates, findTarget } from './index';

// jsdom has no layout, so visibility is simulated with [hidden]/[data-hidden].
const isVisible = (el: Element) => !el.closest('[hidden], [data-hidden]');

function render(html: string) {
  document.body.innerHTML = html;
}

function find(spec: TargetSpec, exclude?: Element | null) {
  return findTarget(spec, { isVisible, exclude })?.element ?? null;
}

const byId = (id: string) => document.getElementById(id);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findTarget: buttons and links', () => {
  it('highlights the button, not the span inside it', () => {
    render('<div><button id="b"><span class="content"><span>Launch instance</span></span></button></div>');
    expect(find({ text: 'Launch instance', kind: 'button' })).toBe(byId('b'));
  });

  it('ignores case, extra whitespace and plurals', () => {
    render('<a id="a" href="#">  LAUNCH   Instances </a>');
    expect(find({ text: 'Launch instance' })).toBe(byId('a'));
  });

  it('matches icon buttons by aria-label or title', () => {
    render('<button id="r" aria-label="Refresh"><svg></svg></button><button id="d" title="Delete"><svg></svg></button>');
    expect(find({ text: 'Refresh', kind: 'button' })).toBe(byId('r'));
    expect(find({ text: 'Delete', kind: 'button' })).toBe(byId('d'));
  });

  it('prefers the exact label over a longer one', () => {
    render('<button>Create function URL</button><button id="x">Create function</button>');
    expect(find({ text: 'Create function', kind: 'button' })).toBe(byId('x'));
  });

  it('prefers the requested kind of element', () => {
    render('<h1>Create function</h1><p>Fill in the form.</p><button id="submit">Create function</button>');
    expect(find({ text: 'Create function', kind: 'button' })).toBe(byId('submit'));
  });

  it('skips hidden duplicates', () => {
    render('<button hidden>Create bucket</button><button id="visible">Create bucket</button>');
    expect(find({ text: 'Create bucket', kind: 'button' })).toBe(byId('visible'));
  });

  it('prefers enabled buttons and ones not behind a modal', () => {
    render(`
      <main aria-hidden="true"><button>Create</button></main>
      <button disabled>Create</button>
      <div role="dialog"><button id="modal">Create</button></div>`);
    expect(find({ text: 'Create', kind: 'button' })).toBe(byId('modal'));
  });

  it('finds ARIA widgets such as tabs', () => {
    render('<div role="tablist"><div role="tab">Code</div><div role="tab" id="cfg">Configuration</div></div>');
    expect(find({ text: 'Configuration', kind: 'tab' })).toBe(byId('cfg'));
  });

  it('promotes a service tile title to the clickable card', () => {
    render('<a id="tile" href="/ec2"><div><h3>EC2</h3><p>Virtual servers in the cloud</p></div></a>');
    expect(find({ text: 'EC2', kind: 'link' })).toBe(byId('tile'));
  });

  it('falls back to plain text when nothing interactive matches', () => {
    render('<div class="summary"><h3 id="h">Instance summary</h3></div>');
    expect(find({ text: 'Instance summary', kind: 'text' })).toBe(byId('h'));
  });

  it('cleans up labels written like `"Create bucket" button`', () => {
    render('<button id="b">Create bucket</button>');
    expect(find({ text: '"Create bucket" button' })).toBe(byId('b'));
  });

  it('tries alternatives', () => {
    render('<button id="b">Launch instance</button>');
    expect(find({ text: 'Launch an EC2 instance now', alternatives: ['Launch instance'] })).toBe(byId('b'));
  });

  it('returns null when nothing matches confidently', () => {
    render('<button>Cancel</button><button>Launch templates</button>');
    expect(find({ text: 'Launch instance', kind: 'button' })).toBeNull();
  });
});

describe('findTarget: form fields', () => {
  it('finds an input through <label for>', () => {
    render('<label for="fn">Function name</label><input id="fn" />');
    expect(find({ text: 'Function name', kind: 'input' })).toBe(byId('fn'));
  });

  it('finds an input through aria-labelledby', () => {
    render('<span id="lbl">Bucket name</span><div><input id="bucket" aria-labelledby="lbl" /></div>');
    expect(find({ text: 'Bucket name', kind: 'input' })).toBe(byId('bucket'));
  });

  it('finds a field from its caption when there is no ARIA wiring', () => {
    render(`
      <div class="form-field"><div class="awsui_label">Name</div><div><input id="name" /></div></div>
      <div class="form-field"><div class="awsui_label">Description</div><div><textarea id="desc"></textarea></div></div>`);
    expect(find({ text: 'Description', kind: 'input' })).toBe(byId('desc'));
    expect(find({ text: 'Name', kind: 'input' })).toBe(byId('name'));
  });

  it('finds an input by placeholder', () => {
    render('<input id="search" type="search" placeholder="Search" />');
    expect(find({ text: 'Search', kind: 'input' })).toBe(byId('search'));
  });

  it('finds a dropdown trigger labelled by the field label and its value', () => {
    render(`
      <label id="rt-label">Runtime</label>
      <button id="rt" aria-haspopup="listbox" aria-labelledby="rt-label rt-value"><span id="rt-value">Node.js 20.x</span></button>`);
    expect(find({ text: 'Runtime', kind: 'select' })).toBe(byId('rt'));
  });

  it('finds options whose text includes a description', () => {
    render(`
      <ul role="listbox">
        <li role="option" id="small"><span>t3.small</span><span>Family: t3 · 2 vCPU · 2 GiB Memory</span></li>
        <li role="option" id="micro"><span>t3.micro</span><span>Family: t3 · 2 vCPU · 1 GiB Memory</span></li>
      </ul>`);
    expect(find({ text: 't3.micro', kind: 'option' })).toBe(byId('micro'));
  });

  it('highlights the visible label of a visually hidden radio tile', () => {
    render(`
      <div class="tiles">
        <label id="scratch"><input type="radio" name="mode" data-hidden /><span>Author from scratch</span></label>
        <label id="blueprint"><input type="radio" name="mode" data-hidden /><span>Use a blueprint</span></label>
      </div>`);
    expect(find({ text: 'Author from scratch', kind: 'radio' })).toBe(byId('scratch'));
  });

  it('highlights the label of a visually hidden checkbox', () => {
    render('<input type="checkbox" id="https" data-hidden /><label for="https" id="https-label">Allow HTTPS traffic from the internet</label>');
    expect(find({ text: 'Allow HTTPS traffic from the internet', kind: 'checkbox' })).toBe(byId('https-label'));
  });
});

describe('findTarget: hard-to-reach elements', () => {
  it('looks inside shadow DOM', () => {
    render('<my-widget id="host"></my-widget>');
    const shadow = byId('host')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<div><button id="inner">Deploy</button></div>';
    expect(find({ text: 'Deploy', kind: 'button' })).toBe(shadow.getElementById('inner'));
  });

  it('uses section headings to pick between identical labels', () => {
    render(`
      <section><h2>Tags</h2><button id="edit-tags">Edit</button></section>
      <section><div><h2>Basic settings</h2></div><div><button id="edit-basic">Edit</button></div></section>`);
    expect(find({ text: 'Edit', kind: 'button', context: 'Basic settings' })).toBe(byId('edit-basic'));
    expect(find({ text: 'Edit', kind: 'button', context: 'Tags' })).toBe(byId('edit-tags'));
  });

  it('never matches the extension’s own UI', () => {
    render('<div id="tour-host"><button>Next</button></div><button id="page-next">Next</button>');
    expect(find({ text: 'Next', kind: 'button' }, byId('tour-host'))).toBe(byId('page-next'));
    byId('page-next')!.remove();
    expect(find({ text: 'Next', kind: 'button' }, byId('tour-host'))).toBeNull();
  });
});

describe('collectCandidates', () => {
  it('numbers the visible interactive elements with their labels', () => {
    render(`
      <button>Create function</button>
      <button hidden>Hidden</button>
      <a href="#">Functions</a>
      <label for="q">Filter functions</label><input id="q" />
      <button aria-label="Refresh"><svg></svg></button>`);
    const { candidates, elements } = collectCandidates({ isVisible });
    expect(candidates.map((c) => c.label)).toEqual([
      'Create function',
      'Functions',
      'Filter functions',
      'Filter functions',
      'Refresh',
    ]);
    expect(candidates.map((c) => c.id)).toEqual([0, 1, 2, 3, 4]);
    expect(candidates[0].kind).toBe('button');
    expect(candidates[1].kind).toBe('link');
    expect(elements).toHaveLength(candidates.length);
  });

  it('respects the limit', () => {
    render(Array.from({ length: 20 }, (_, i) => `<button>Button ${i}</button>`).join(''));
    expect(collectCandidates({ isVisible, limit: 5 }).candidates).toHaveLength(5);
  });
});
