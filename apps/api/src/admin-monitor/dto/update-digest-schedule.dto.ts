import { IsInt, Max, Min } from "class-validator";

export class UpdateDigestScheduleDto {
  @IsInt()
  @Min(0)
  @Max(23)
  dailyHour!: number;

  @IsInt()
  @Min(0)
  @Max(59)
  dailyMinute!: number;

  // 0=domingo..6=sábado (mesma convenção de Date.prototype.getUTCDay()).
  @IsInt()
  @Min(0)
  @Max(6)
  weeklyDayOfWeek!: number;
}
