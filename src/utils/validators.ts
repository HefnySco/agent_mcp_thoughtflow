/**
 * Shared validators for Thoughtflow MCP server
 */

import { ValidationError } from '../types/index.js';

export function validateRequiredString(value: any, fieldName: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${fieldName} is required and must be a non-empty string`, fieldName);
  }
}

export function validateOptionalString(value: any, fieldName: string): void {
  if (value !== undefined && value !== null && (typeof value !== 'string' || value.trim() === '')) {
    throw new ValidationError(`${fieldName} must be a non-empty string if provided`, fieldName);
  }
}

export function validateEvaluationScore(score: number): void {
  if (typeof score !== 'number' || isNaN(score) || score < 0 || score > 100) {
    throw new ValidationError('Evaluation score must be a number between 0 and 100', 'score');
  }
}

export function validateNumberRange(value: number, fieldName: string, min: number, max: number): void {
  if (typeof value !== 'number' || isNaN(value) || value < min || value > max) {
    throw new ValidationError(`${fieldName} must be a number between ${min} and ${max}`, fieldName);
  }
}

export function validateSessionId(sessionId?: string): void {
  if (sessionId !== undefined && sessionId !== null) {
    if (typeof sessionId !== 'string') {
      throw new ValidationError('sessionId must be a string if provided', 'sessionId');
    }
    if (sessionId.trim() === '') {
      throw new ValidationError('sessionId cannot be an empty string', 'sessionId');
    }
  }
}

export function validateId(id: string, idType: string): void {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new ValidationError(`${idType} ID is required and must be a non-empty string`, idType);
  }
}
