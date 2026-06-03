import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import { AuthenticatedUser } from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { AddNoteDto } from "./dto/add-note.dto";
import { CreateJobApplicationDto } from "./dto/create-job-application.dto";
import { ListJobApplicationHighlightsDto } from "./dto/list-job-application-highlights.dto";
import { ListJobApplicationsDto } from "./dto/list-job-applications.dto";
import { UpdateJobApplicationStatusDto } from "./dto/update-job-application-status.dto";
import { JobApplicationInterviewPrepService } from "./interview-prep.service";
import { JobApplicationsService } from "./job-applications.service";

@Controller("job-applications")
@UseGuards(JwtAuthGuard)
export class JobApplicationsController {
  constructor(
    @Inject(JobApplicationsService)
    private readonly service: JobApplicationsService,
    @Inject(JobApplicationInterviewPrepService)
    private readonly interviewPrepService: JobApplicationInterviewPrepService,
  ) {}

  @Get()
  list(
    @AuthenticatedUser() user: { id: string },
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: ListJobApplicationsDto,
      }),
    )
    query: ListJobApplicationsDto,
  ) {
    return this.service.list(
      user.id,
      query.page ?? 1,
      query.limit ?? 20,
      query.archived ?? false,
      query.status,
    );
  }

  @Get("highlights")
  listHighlights(
    @AuthenticatedUser() user: { id: string },
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: ListJobApplicationHighlightsDto,
      }),
    )
    query: ListJobApplicationHighlightsDto,
  ) {
    return this.service.listHighlights(user.id, query.limit ?? 3);
  }

  @Get("highlights/summary")
  getHighlightsSummary(@AuthenticatedUser() user: { id: string }) {
    return this.service.getHighlightsSummary(user.id);
  }

  @Get(":id")
  getById(@AuthenticatedUser() user: { id: string }, @Param("id") id: string) {
    return this.service.getById(user.id, id);
  }

  @Post()
  create(
    @AuthenticatedUser() user: { id: string },
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: CreateJobApplicationDto,
      }),
    )
    dto: CreateJobApplicationDto,
  ) {
    return this.service.createManual(user.id, dto);
  }

  @Patch(":id/status")
  updateStatus(
    @AuthenticatedUser() user: { id: string },
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: UpdateJobApplicationStatusDto,
      }),
    )
    dto: UpdateJobApplicationStatusDto,
  ) {
    return this.service.updateStatus(user.id, id, dto.status);
  }

  @Post(":id/notes")
  addNote(
    @AuthenticatedUser() user: { id: string },
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        expectedType: AddNoteDto,
      }),
    )
    dto: AddNoteDto,
  ) {
    return this.service.addNote(user.id, id, dto.note);
  }

  @Post(":id/archive")
  archive(@AuthenticatedUser() user: { id: string }, @Param("id") id: string) {
    return this.service.archive(user.id, id);
  }

  @Post(":id/restore")
  restore(@AuthenticatedUser() user: { id: string }, @Param("id") id: string) {
    return this.service.restore(user.id, id);
  }

  @Post(":id/delete")
  delete(@AuthenticatedUser() user: { id: string }, @Param("id") id: string) {
    return this.service.delete(user.id, id);
  }

  @Post(":id/interview-prep")
  generateOrGetInterviewPrep(
    @AuthenticatedUser() user: { id: string },
    @Param("id") id: string,
  ) {
    return this.interviewPrepService.generateOrGet(user.id, id);
  }

  @Post(":id/analyses/:adaptationId/split")
  splitAnalysis(
    @AuthenticatedUser() user: { id: string },
    @Param("id") id: string,
    @Param("adaptationId") adaptationId: string,
  ) {
    return this.service.splitAnalysisIntoNewApplication(
      user.id,
      id,
      adaptationId,
    );
  }
}
