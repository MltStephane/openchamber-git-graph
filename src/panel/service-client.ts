import type { HostClient } from '@openchamber/sdk';

import type { Head, LogPage, Scope } from '../service-contract.ts';

/** A failure the service itself reported, with its own code. */
export class ServiceError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isLogPage = (body: unknown): body is LogPage =>
  isObject(body) && Array.isArray(body.commits) && typeof body.hasMore === 'boolean';

const isHead = (body: unknown): body is Head =>
  isObject(body)
  && (body.branch === null || typeof body.branch === 'string')
  && (body.sha === null || typeof body.sha === 'string')
  && typeof body.dirty === 'boolean'
  && typeof body.changes === 'number'
  && typeof body.refs === 'string';

/** `/log` and `/head` through the host proxy; every answer is checked against the contract. */
export const createServiceClient = (host: Pick<HostClient, 'serviceRequest'>) => {
  const ask = async (path: string, query: Record<string, string>): Promise<unknown> => {
    const result = await host.serviceRequest({ method: 'GET', path, query });
    let body: unknown;
    try { body = JSON.parse(result.body); } catch { throw new ServiceError('bad-answer', `Unparsable body (HTTP ${result.status})`); }
    if (result.status !== 200) {
      const code = isObject(body) && typeof body.error === 'string' ? body.error : 'http';
      const message = isObject(body) && typeof body.message === 'string' ? body.message : `HTTP ${result.status}`;
      throw new ServiceError(code, message);
    }
    return body;
  };

  const readLog = async (dir: string, scope: Scope, limit: number, skip: number): Promise<LogPage> => {
    const body = await ask('/log', { dir, scope, limit: String(limit), skip: String(skip) });
    if (!isLogPage(body)) throw new ServiceError('bad-answer', 'Unexpected /log payload');
    return body;
  };

  const readHead = async (dir: string): Promise<Head> => {
    const body = await ask('/head', { dir });
    if (!isHead(body)) throw new ServiceError('bad-answer', 'Unexpected /head payload');
    return body;
  };

  return { readLog, readHead };
};
