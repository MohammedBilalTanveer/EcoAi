export class HttpError extends Error {
  constructor(status, message, code = undefined, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, code = 'BAD_REQUEST', details) =>
  new HttpError(400, message, code, details);
export const unauthorized = (message = 'Please sign in to continue.', code = 'AUTH_REQUIRED') =>
  new HttpError(401, message, code);
export const forbidden = (message = 'You do not have access to this.', code = 'FORBIDDEN') =>
  new HttpError(403, message, code);
export const notFound = (message = 'Not found.', code = 'NOT_FOUND', details) =>
  new HttpError(404, message, code, details);
export const conflict = (message, code = 'CONFLICT', details) =>
  new HttpError(409, message, code, details);
