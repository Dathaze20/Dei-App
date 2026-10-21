// The Android release workflow: publishing must only ever happen on an explicit, approved run.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/android-release.yml', 'utf8'));
const jobs = workflow.jobs as Record<string, { if?: string; needs?: string; permissions?: Record<string, string>; steps: { name: string; run?: string; if?: string }[] }>;

describe('Android release workflow', () => {
  it('runs only when started by hand; a push, pull request or merge never builds or publishes', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.on.workflow_dispatch.inputs.publish_approved_release).toMatchObject({ type: 'boolean', default: false });
  });

  it('publishes only on request, after the verified build, with write access only in that job', () => {
    const publish = jobs['publish-release'];
    expect(publish.if).toBe('inputs.publish_approved_release');
    expect(publish.needs).toBe('build');
    expect(publish.permissions).toEqual({ contents: 'write', actions: 'read' });
    expect(jobs['draft-release'].if).toBe('inputs.create_draft_release && !inputs.publish_approved_release');
    expect(jobs.build.permissions).toBeUndefined();
  });

  it('checks the approved version and commit before building, and green CI and the checksum before publishing', () => {
    const request = jobs.build.steps.find(s => s.name === 'Check the publishing request')!;
    expect(request.if).toBe('inputs.publish_approved_release');
    expect(request.run).toContain('approved_commit');
    const names = jobs['publish-release'].steps.map(s => s.name);
    expect(names.indexOf('Require a green CI run on the approved commit')).toBe(0);
    expect(names.indexOf('Check the APK is the one that was verified')).toBeLessThan(names.findIndex(n => n.startsWith('Publish')));
    expect(names.at(-1)).toBe('Confirm what the app will see');
  });

  it('every shell step is valid bash', () => {
    for (const [job, { steps }] of Object.entries(jobs)) {
      for (const step of steps.filter(s => s.run)) {
        const script = step.run!.replace(/\$\{\{[^}]*\}\}/g, 'X');
        expect(() => execFileSync('bash', ['-n'], { input: script }), `${job}: ${step.name}`).not.toThrow();
      }
    }
  });
});
