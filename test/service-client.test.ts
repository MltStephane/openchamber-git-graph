import { describe, expect, test } from 'bun:test';
import type { GuestRequest } from '@openchamber/sdk';

import { createServiceClient, ServiceError } from '../src/panel/service-client.ts';

const COMMIT = { hash: 'a'.repeat(40), parents: [], refs: [], author: 'Ada', timestamp: 1700000000, subject: 'Initial commit' };
const HEAD = { branch: 'master', sha: 'a'.repeat(40), dirty: false, changes: 0, refs: 'f1' };

/** A host whose service always sends the same answer, recording what was asked. */
const fakeHost = (status: number, body: string) => {
  const requests: GuestRequest[] = [];
  const client = createServiceClient({
    serviceRequest: async (request) => { requests.push(request); return { status, body }; },
  });
  return { client, requests };
};

const rejection = async (promise: Promise<unknown>): Promise<ServiceError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ServiceError) return error;
    throw error;
  }
  throw new Error('Expected a rejection');
};

describe('readLog', () => {
  test('a valid page is returned as is, asked with GET and string query values', async () => {
    const { client, requests } = fakeHost(200, JSON.stringify({ commits: [COMMIT], hasMore: true }));
    expect(await client.readLog('/repo', 'current', 5, 10)).toEqual({ commits: [COMMIT], hasMore: true });
    expect(requests).toEqual([{ method: 'GET', path: '/log', query: { dir: '/repo', scope: 'current', limit: '5', skip: '10' } }]);
  });

  test('a failure reported by the service keeps its code and message', async () => {
    const { client } = fakeHost(422, JSON.stringify({ error: 'not-a-repo', message: 'This folder is not a git repository.' }));
    const error = await rejection(client.readLog('/repo', 'all', 5, 0));
    expect(error.code).toBe('not-a-repo');
    expect(error.message).toBe('This folder is not a git repository.');
  });

  test('a failure without a usable body is an HTTP error', async () => {
    const { client } = fakeHost(502, '{}');
    const error = await rejection(client.readLog('/repo', 'all', 5, 0));
    expect(error.code).toBe('http');
    expect(error.message).toBe('HTTP 502');
  });

  test('a body that is not JSON is a bad answer, whatever the status', async () => {
    expect((await rejection(fakeHost(200, '<html>').client.readLog('/repo', 'all', 5, 0))).code).toBe('bad-answer');
    expect((await rejection(fakeHost(500, 'Internal error').client.readLog('/repo', 'all', 5, 0))).code).toBe('bad-answer');
  });

  test('a page without commits or with a non-boolean hasMore is a bad answer', async () => {
    expect((await rejection(fakeHost(200, JSON.stringify({ hasMore: false })).client.readLog('/repo', 'all', 5, 0))).code).toBe('bad-answer');
    expect((await rejection(fakeHost(200, JSON.stringify({ commits: [], hasMore: 'yes' })).client.readLog('/repo', 'all', 5, 0))).code).toBe('bad-answer');
  });
});

describe('readHead', () => {
  test('a valid head is returned as is, asked with GET', async () => {
    const { client, requests } = fakeHost(200, JSON.stringify(HEAD));
    expect(await client.readHead('/repo')).toEqual(HEAD);
    expect(requests).toEqual([{ method: 'GET', path: '/head', query: { dir: '/repo' } }]);
  });

  test('a detached HEAD or an empty repository has null branch and sha', async () => {
    const detached = { ...HEAD, branch: null };
    expect(await fakeHost(200, JSON.stringify(detached)).client.readHead('/repo')).toEqual(detached);
    const empty = { ...HEAD, branch: null, sha: null };
    expect(await fakeHost(200, JSON.stringify(empty)).client.readHead('/repo')).toEqual(empty);
  });

  test('a failure reported by the service keeps its code and message', async () => {
    const { client } = fakeHost(401, JSON.stringify({ error: 'unauthorized', message: 'Missing or wrong service token.' }));
    const error = await rejection(client.readHead('/repo'));
    expect(error.code).toBe('unauthorized');
    expect(error.message).toBe('Missing or wrong service token.');
  });

  test('a head without refs or with a wrong field type is a bad answer', async () => {
    const { refs: _refs, ...withoutRefs } = HEAD;
    expect((await rejection(fakeHost(200, JSON.stringify(withoutRefs)).client.readHead('/repo'))).code).toBe('bad-answer');
    expect((await rejection(fakeHost(200, JSON.stringify({ ...HEAD, changes: '2' })).client.readHead('/repo'))).code).toBe('bad-answer');
    expect((await rejection(fakeHost(200, 'null').client.readHead('/repo'))).code).toBe('bad-answer');
  });
});
