import type { FastifyInstance } from "fastify";
import { apiErrorResponse } from "@harakiri/shared";
import { ZodError } from "zod";

const issuePath = (path: PropertyKey[]) => path.map(String).join(".");

const issueMessage = (issue: ZodError["issues"][number]) => {
  const path = issuePath(issue.path);
  return path ? `${path}: ${issue.message}` : issue.message;
};

export const registerApiErrorHandler = (app: FastifyInstance) => {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.map(String),
        message: issue.message
      }));
      return reply.code(400).send(apiErrorResponse("validation_error", {
        message: error.issues.map(issueMessage).join("; "),
        issues
      }));
    }

    return reply.send(error);
  });
};
