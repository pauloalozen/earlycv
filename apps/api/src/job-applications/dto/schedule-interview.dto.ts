import { IsISO8601, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";

export class ScheduleInterviewDto {
  @IsISO8601()
  scheduledAt!: string;

  @IsString()
  @MaxLength(100)
  interviewTitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  interviewerName?: string;

  @IsOptional()
  @IsUrl({}, { message: "interviewMeetingUrl deve ser uma URL válida" })
  interviewMeetingUrl?: string;
}
