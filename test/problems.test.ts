import { describe, expect, test } from 'bun:test';
import { HostRequestError } from '@openchamber/sdk';

import { toProblem } from '../src/panel/problems.ts';
import { ServiceError } from '../src/panel/service-client.ts';

describe('toProblem: service errors', () => {
  test('a folder that is not a repository, or cannot be found', () => {
    expect(toProblem(new ServiceError('not-a-repo', 'raw'))).toStrictEqual({ kind: 'not-a-repo', message: 'error.notARepo.message' });
    expect(toProblem(new ServiceError('no-directory', 'raw'))).toStrictEqual({ kind: 'not-a-repo', message: 'error.noDirectory.message' });
  });

  test('codes whose raw message adds nothing carry no detail', () => {
    expect(toProblem(new ServiceError('unauthorized', 'raw'))).toStrictEqual({ kind: 'error', title: 'error.service.title', message: 'error.unauthorized' });
    expect(toProblem(new ServiceError('not-found', 'raw'))).toStrictEqual({ kind: 'error', title: 'error.service.title', message: 'error.notFound' });
    expect(toProblem(new ServiceError('bad-request', 'raw'))).toStrictEqual({ kind: 'error', title: 'error.service.title', message: 'error.badRequest' });
    expect(toProblem(new ServiceError('no-git', 'raw'))).toStrictEqual({ kind: 'error', title: 'error.service.title', message: 'error.noGit' });
  });

  test('codes whose raw message is the explanation keep it as detail', () => {
    expect(toProblem(new ServiceError('git-failed', 'fatal: bad object'))).toStrictEqual({ kind: 'error', title: 'error.service.title', message: 'error.gitFailed', detail: 'fatal: bad object' });
    expect(toProblem(new ServiceError('bad-answer', 'Unexpected /log payload'))).toStrictEqual({ kind: 'error', title: 'error.service.title', message: 'error.badAnswer', detail: 'Unexpected /log payload' });
    expect(toProblem(new ServiceError('http', 'HTTP 502'))).toStrictEqual({ kind: 'error', title: 'error.service.title', message: 'error.http', detail: 'HTTP 502' });
  });

  test('an unknown service code is reported as such, with its message', () => {
    expect(toProblem(new ServiceError('something-new', 'raw'))).toStrictEqual({ kind: 'error', title: 'error.service.title', message: 'error.serviceUnknown', detail: 'raw' });
  });
});

describe('toProblem: host errors', () => {
  test('a service the user has not allowed', () => {
    expect(toProblem(new HostRequestError('NO_SERVICE', 'raw'))).toStrictEqual({ kind: 'no-service' });
  });

  test('a service that crashed keeps the host message as detail', () => {
    expect(toProblem(new HostRequestError('SERVICE_FAILED', 'exit 1'))).toStrictEqual({ kind: 'error', title: 'error.serviceFailed.title', message: 'error.serviceFailed.message', detail: 'exit 1' });
  });

  test('a paused extension and a timeout carry no detail', () => {
    expect(toProblem(new HostRequestError('DISABLED', 'raw'))).toStrictEqual({ kind: 'error', title: 'error.disabled.title', message: 'error.disabled.message' });
    expect(toProblem(new HostRequestError('HOST_TIMEOUT', 'raw'))).toStrictEqual({ kind: 'error', title: 'error.timeout.title', message: 'error.timeout.message' });
  });

  test('any other host code is shown with the code and the host message', () => {
    expect(toProblem(new HostRequestError('DENIED', 'nope'))).toStrictEqual({ kind: 'error', title: 'error.host.title', message: 'error.host.message', params: { code: 'DENIED' }, detail: 'nope' });
  });
});

describe('toProblem: anything else', () => {
  test('an Error keeps its message as detail', () => {
    expect(toProblem(new Error('x'))).toStrictEqual({ kind: 'error', title: 'error.unexpected.title', message: 'error.unexpected.message', detail: 'x' });
  });

  test('a thrown value that is not an Error is stringified', () => {
    expect(toProblem('boom')).toStrictEqual({ kind: 'error', title: 'error.unexpected.title', message: 'error.unexpected.message', detail: 'boom' });
  });
});
