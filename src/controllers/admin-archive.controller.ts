import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { OutboxArchiveService } from "../domain-events/outbox-archive.service";

@Controller({ path: "admin/archive", version: VERSION_NEUTRAL })
export class AdminArchiveController {
  constructor(private archiveService: OutboxArchiveService) {}

  @Get("stats")
  async getArchiveStats() {
    return this.archiveService.getArchiveStats();
  }

  @Get("hot-table-stats")
  async getHotTableStats() {
    return this.archiveService.getHotTableStats();
  }

  @Get("events")
  async getArchivedEvents(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("eventType") eventType?: string,
    @Query("status") status?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.archiveService.getArchivedEvents(
      pageNum,
      limitNum,
      eventType,
      status,
    );
  }

  @Post("archive-now")
  @HttpCode(HttpStatus.OK)
  async archiveOldEvents(@Body("daysToKeep") daysToKeep?: string) {
    const daysToKeepNum = daysToKeep ? parseInt(daysToKeep, 10) : 7;
    return this.archiveService.archiveOldEvents(daysToKeepNum);
  }

  @Post("hard-delete")
  @HttpCode(HttpStatus.OK)
  async hardDeleteOldArchivedEvents(@Body("daysToKeep") daysToKeep?: string) {
    const daysToKeepNum = daysToKeep ? parseInt(daysToKeep, 10) : 90;
    return this.archiveService.hardDeleteOldArchivedEvents(daysToKeepNum);
  }

  @Post("emergency-archive")
  @HttpCode(HttpStatus.OK)
  async emergencyArchive() {
    await this.archiveService.archiveOldEvents(3); // Archive events older than 3 days
    return { message: "Emergency archive completed" };
  }
}
