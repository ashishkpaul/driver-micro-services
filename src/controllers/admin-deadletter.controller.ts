import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { DeadLetterService } from "../domain-events/dead-letter.service";

@Controller("admin/deadletter")
export class AdminDeadLetterController {
  constructor(private deadLetterService: DeadLetterService) {}

  @Get("inspect")
  async inspectFailedEvents(@Query("limit") limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    return this.deadLetterService.inspectFailedEvents(limitNum);
  }

  @Get("events")
  async getFailedEvents(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("errorType") errorType?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.deadLetterService.getFailedEvents(pageNum, limitNum, errorType);
  }

  @Get("events/:id")
  async getFailedEvent(@Param("id", ParseIntPipe) id: number) {
    const result = await this.deadLetterService.getFailedEvents(1, 1);
    const event = result.events.find((e) => e.id === id);

    if (!event) {
      throw new Error(`Failed event with ID ${id} not found`);
    }

    return event;
  }

  @Post("events/:id/retry")
  @HttpCode(HttpStatus.OK)
  async retryEvent(@Param("id", ParseIntPipe) id: number) {
    await this.deadLetterService.retryEvent(id);
    return { message: `Event ${id} retried successfully` };
  }

  @Post("events/retry-all")
  @HttpCode(HttpStatus.OK)
  async retryAllFailedEvents(@Body("limit") limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.deadLetterService.retryAllFailedEvents(limitNum);
  }

  @Get("threshold-check")
  async checkFailureThreshold(@Query("threshold") threshold?: string) {
    const thresholdNum = threshold ? parseInt(threshold, 10) : 10;
    const alertTriggered =
      await this.deadLetterService.checkFailureThreshold(thresholdNum);

    // Get recent failure count for response
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentFailures = await this.deadLetterService.getFailedEvents(
      1,
      1000,
    );
    const recentCount = recentFailures.events.filter(
      (event) => event.createdAt && event.createdAt > oneHourAgo,
    ).length;

    return {
      alertTriggered,
      recentFailures: recentCount,
      threshold: thresholdNum,
    };
  }

  @Post("cleanup")
  @HttpCode(HttpStatus.OK)
  async cleanupExpiredEvents(@Body("daysToKeep") daysToKeep?: string) {
    const daysToKeepNum = daysToKeep ? parseInt(daysToKeep, 10) : 30;
    return this.deadLetterService.cleanupExpiredEvents(daysToKeepNum);
  }
}
