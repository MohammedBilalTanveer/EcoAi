import multer from 'multer';
import mongoose from 'mongoose';
import { HttpError } from '../utils/http.js';

export function apiNotFound(req, res) {
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'That image is too large. Please use a photo under 10 MB.'
        : err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT'
          ? 'Too many images attached.'
          : err.message;
    return res.status(400).json({ error: message, code: err.code });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ error: first?.message || 'Invalid data.', code: 'VALIDATION_ERROR' });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body.', code: 'BAD_JSON' });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'That record already exists.', code: 'DUPLICATE' });
  }
  // Client errors raised by Express itself (e.g. a missing static file, a payload too large).
  if (err?.status >= 400 && err.status < 500) {
    const notFound = err.status === 404;
    return res.status(err.status).json({
      error: err.expose ? err.message : notFound ? 'Not found.' : 'Bad request.',
      code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST',
    });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.', code: 'SERVER_ERROR' });
}
