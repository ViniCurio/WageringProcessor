import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import {
  ConflictError,
  DomainError,
  InsufficientFundsError,
  InvalidRequestError,
  NotFoundError,
} from "../domain/errors";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] =
      error instanceof Error ? error.message : "Internal error";
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      if (typeof body === "string") message = body;
      else if (body && typeof body === "object" && "message" in body) {
        const detail = body.message;
        if (
          typeof detail === "string" ||
          (Array.isArray(detail) && detail.every((item) => typeof item === "string"))
        )
          message = detail;
      }
    } else if (error instanceof InvalidRequestError) status = 400;
    else if (error instanceof NotFoundError) status = 404;
    else if (error instanceof ConflictError) status = 409;
    else if (
      error instanceof InsufficientFundsError ||
      error instanceof DomainError
    )
      status = 422;
    else if (this.isTransientInfrastructure(error)) status = 503;
    if (status >= 500)
      process.stderr.write(
        `${JSON.stringify({ level: "error", event: "unhandled_http_error", message })}\n`,
      );
    response.status(status).json({
      statusCode: status,
      message: status >= 500 ? "Service temporarily unavailable" : message,
    });
  }

  private isTransientInfrastructure(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const code = "code" in error ? String(error.code) : "";
    return [
      "ECONNREFUSED",
      "ETIMEDOUT",
      "57P01",
      "53300",
      "08006",
      "40P01",
      "55P03",
      "40001",
    ].includes(code);
  }
}
