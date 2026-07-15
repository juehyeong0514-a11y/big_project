import { Controller, Get, Inject } from "@nestjs/common";
import { OperationsReadinessService } from "../services/operations-readiness.service.js";

@Controller("/api/operations")
export class OperationsController {
  constructor(@Inject(OperationsReadinessService) private readonly readiness: OperationsReadinessService) {}

  @Get("/readiness")
  getReadiness() {
    return this.readiness.getReadiness();
  }
}
