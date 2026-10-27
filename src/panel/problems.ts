import { HostRequestError } from '@openchamber/sdk';

import type { MessageKey, MessageParams } from './i18n.ts';
import { ServiceError } from './service-client.ts';

/** Texts are kept as keys so a locale change repaints them; `detail` is the raw, untranslated cause. */
export type Problem =
  | { kind: 'no-project' }
  | { kind: 'not-a-repo'; message: MessageKey }
  | { kind: 'no-service' }
  | { kind: 'error'; title: MessageKey; message: MessageKey; params?: MessageParams; detail?: string };

/** Service codes whose raw message adds nothing to the translated one. */
const SERVICE_MESSAGE = new Map<string, MessageKey>([
  ['unauthorized', 'error.unauthorized'],
  ['not-found', 'error.notFound'],
  ['bad-request', 'error.badRequest'],
  ['no-git', 'error.noGit'],
]);
/** Service codes whose raw message is the only real explanation, kept as detail. */
const SERVICE_MESSAGE_WITH_DETAIL = new Map<string, MessageKey>([
  ['git-failed', 'error.gitFailed'],
  ['bad-answer', 'error.badAnswer'],
  ['http', 'error.http'],
]);

export const toProblem = (error: unknown): Problem => {
  if (error instanceof ServiceError) {
    if (error.code === 'not-a-repo') return { kind: 'not-a-repo', message: 'error.notARepo.message' };
    if (error.code === 'no-directory') return { kind: 'not-a-repo', message: 'error.noDirectory.message' };
    const message = SERVICE_MESSAGE.get(error.code);
    if (message) return { kind: 'error', title: 'error.service.title', message };
    return { kind: 'error', title: 'error.service.title', message: SERVICE_MESSAGE_WITH_DETAIL.get(error.code) ?? 'error.serviceUnknown', detail: error.message };
  }
  if (error instanceof HostRequestError) {
    if (error.code === 'NO_SERVICE') return { kind: 'no-service' };
    if (error.code === 'SERVICE_FAILED') return { kind: 'error', title: 'error.serviceFailed.title', message: 'error.serviceFailed.message', detail: error.message };
    if (error.code === 'DISABLED') return { kind: 'error', title: 'error.disabled.title', message: 'error.disabled.message' };
    if (error.code === 'HOST_TIMEOUT') return { kind: 'error', title: 'error.timeout.title', message: 'error.timeout.message' };
    return { kind: 'error', title: 'error.host.title', message: 'error.host.message', params: { code: error.code }, detail: error.message };
  }
  return { kind: 'error', title: 'error.unexpected.title', message: 'error.unexpected.message', detail: error instanceof Error ? error.message : String(error) };
};
