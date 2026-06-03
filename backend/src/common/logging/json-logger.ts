import { LoggerService, LogLevel } from '@nestjs/common';

/**
 * Structured JSON logger for NestJS.
 *
 * In production (NODE_ENV=production) every log line is a single-line JSON
 * object — ideal for log aggregators such as Datadog, CloudWatch, ELK, or GCP
 * Cloud Logging.
 *
 * In development the output stays human-readable (coloured NestJS format).
 *
 * Output shape (production):
 * {
 *   "timestamp": "2024-01-15T10:30:00.000Z",
 *   "level":     "info",
 *   "context":   "AuthService",
 *   "message":   "User logged in",
 *   "pid":       12345
 * }
 */
export class JsonLogger implements LoggerService {
  private readonly isProduction = process.env.NODE_ENV === 'production';
  private readonly pid = process.pid;

  log(message: any, context?: string): void {
    this.write('info', message, context);
  }

  error(message: any, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: any, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: any, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: any, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: any, context?: string): void {
    this.write('fatal', message, context);
  }

  setLogLevels?(_levels: LogLevel[]): void {
    // Level filtering can be wired to an env var if needed
  }

  // ---------------------------------------------------------------------------

  private write(
    level: string,
    message: any,
    context?: string,
    trace?: string,
  ): void {
    if (this.isProduction) {
      this.writeJson(level, message, context, trace);
    } else {
      this.writePretty(level, message, context, trace);
    }
  }

  private writeJson(
    level: string,
    message: any,
    context?: string,
    trace?: string,
  ): void {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      pid: this.pid,
      context: context ?? 'Application',
      message: this.stringify(message),
    };

    if (trace) {
      entry['trace'] = trace;
    }

    // Single call to process.stdout.write avoids interleaved lines under load
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  private writePretty(
    level: string,
    message: any,
    context?: string,
    trace?: string,
  ): void {
    const color = LEVEL_COLORS[level] ?? RESET;
    const ts = new Date().toISOString();
    const ctx = context ? ` [${context}]` : '';
    const line = `${color}[${level.toUpperCase()}]${RESET} ${ts}${ctx} ${this.stringify(message)}`;
    process.stdout.write(line + '\n');

    if (trace) {
      process.stderr.write(`${LEVEL_COLORS['error']}${trace}${RESET}\n`);
    }
  }

  private stringify(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

// ANSI colour codes for development output
const RESET = '\x1b[0m';
const LEVEL_COLORS: Record<string, string> = {
  info:    '\x1b[32m', // green
  error:   '\x1b[31m', // red
  warn:    '\x1b[33m', // yellow
  debug:   '\x1b[36m', // cyan
  verbose: '\x1b[35m', // magenta
  fatal:   '\x1b[91m', // bright red
};
