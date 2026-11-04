import { describe, expect, it } from 'vitest';
import { normalize, prepare, scoreText, stemWord, targetVariants } from './text';

const score = (candidate: string, target: string) => scoreText(prepare(candidate), prepare(target));

describe('normalize', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalize('  Launch   Instance ▼ ')).toBe('launch instance');
    expect(normalize('Create bucket…')).toBe('create bucket');
    expect(normalize('“Next”')).toBe('next');
  });

  it('removes zero-width characters and expands ampersands', () => {
    expect(normalize('Se​curity & Identity')).toBe('security and identity');
  });

  it('treats dots, dashes and slashes as word breaks on both sides', () => {
    expect(normalize('t2.micro')).toBe('t2 micro');
    expect(normalize('Sign-in')).toBe('sign in');
  });
});

describe('stemWord', () => {
  it('strips simple plurals', () => {
    expect(stemWord('instances')).toBe('instance');
    expect(stemWord('policies')).toBe('policy');
    expect(stemWord('buckets')).toBe('bucket');
  });

  it('leaves words that only look plural', () => {
    expect(stemWord('access')).toBe('access');
    expect(stemWord('status')).toBe('status');
    expect(stemWord('analysis')).toBe('analysis');
    expect(stemWord('vpcs')).toBe('vpc');
  });
});

describe('scoreText', () => {
  it('ranks exact > plural > containing > partial', () => {
    const exact = score('Launch instance', 'Launch instance');
    const plural = score('Launch instances', 'Launch instance');
    const containing = score('Launch instance Info', 'Launch instance');
    const partial = score('Create function', 'Create function URL');
    expect(exact).toBe(100);
    expect(plural).toBe(96);
    expect(containing).toBeLessThan(plural);
    expect(partial).toBeLessThan(containing);
    expect(partial).toBeGreaterThanOrEqual(60);
  });

  it('is case and whitespace insensitive', () => {
    expect(score('  LAUNCH   instance ', 'Launch instance')).toBe(100);
  });

  it('penalises long labels that merely mention the target', () => {
    expect(score('Amazon EC2 provides secure and resizable compute capacity in the cloud', 'EC2')).toBeLessThan(55);
    expect(score('Create function from a container image now', 'Create function')).toBeLessThan(70);
  });

  it('is stricter with one-word targets', () => {
    expect(score('Edit tags', 'Edit')).toBeGreaterThanOrEqual(62);
    expect(score('Enable function URL', 'Enable')).toBeLessThan(score('Enable function', 'Enable'));
    expect(score('EC2 Virtual servers in the cloud', 'EC2')).toBeLessThan(55);
  });

  it('rejects labels sharing only one word', () => {
    expect(score('Launch templates', 'Launch instance')).toBeLessThan(55);
    expect(score('Launch', 'Launch instance')).toBeLessThan(55);
    expect(score('Delete', 'Create')).toBe(0);
  });

  it('requires numbers to match exactly', () => {
    expect(score('Node.js 20.x', 'Node.js 22.x')).toBe(0);
    expect(score('Python 3.12', 'Python 3.13')).toBe(0);
    expect(score('us-east-2', 'us-east-1')).toBe(0);
    expect(score('Node.js 22.x Latest LTS', 'Node.js 22.x')).toBeGreaterThanOrEqual(62);
  });

  it('accepts reordered words', () => {
    expect(score('Type of instance', 'Instance type')).toBeGreaterThanOrEqual(60);
  });
});

describe('targetVariants', () => {
  it('cleans up quoted labels and trailing role words', () => {
    expect(targetVariants('"Create bucket" button')).toContain('Create bucket');
    expect(targetVariants('the Runtime dropdown')).toContain('Runtime');
    expect(targetVariants('Launch instance')).toEqual(['Launch instance']);
  });
});
