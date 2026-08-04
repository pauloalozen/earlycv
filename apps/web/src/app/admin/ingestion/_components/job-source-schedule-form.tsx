"use client";

import { useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  buildCronFromHuman,
  type HumanSchedule,
  parseCronToHuman,
  WEEKDAY_LABELS,
} from "./job-source-schedule-format";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  jobSourceId: string;
  redirectPath: string;
  initialCron: string | null;
  initialEnabled: boolean;
};

type ScheduleType = "DAILY" | "EVERY_N_HOURS" | "WEEKLY";

export function JobSourceScheduleForm({
  action,
  jobSourceId,
  redirectPath,
  initialCron,
  initialEnabled,
}: Props) {
  const parsed = parseCronToHuman(initialCron);
  const fallback: HumanSchedule = { hour: 7, minute: 0, type: "DAILY" };
  const initial = parsed.type === "UNKNOWN" ? fallback : parsed;

  const [enabled, setEnabled] = useState(initialEnabled);
  const [scheduleType, setScheduleType] = useState<ScheduleType>(initial.type);
  const [hour, setHour] = useState(
    String("hour" in initial ? initial.hour : 7),
  );
  const [minute, setMinute] = useState(
    String("minute" in initial ? initial.minute : 0),
  );
  const [interval, setInterval] = useState(
    String(initial.type === "EVERY_N_HOURS" ? initial.interval : 6),
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    initial.type === "WEEKLY" ? initial.days : [1, 2, 3, 4, 5],
  );

  function toggleDay(day: number) {
    setDaysOfWeek((days) =>
      days.includes(day)
        ? days.filter((d) => d !== day)
        : [...days, day].sort(),
    );
  }

  const cron = buildCronFromHuman(
    scheduleType === "DAILY"
      ? { hour: Number(hour) || 0, minute: Number(minute) || 0, type: "DAILY" }
      : scheduleType === "EVERY_N_HOURS"
        ? {
            interval: Number(interval) || 1,
            minute: Number(minute) || 0,
            type: "EVERY_N_HOURS",
          }
        : {
            days: daysOfWeek,
            hour: Number(hour) || 0,
            minute: Number(minute) || 0,
            type: "WEEKLY",
          },
  );

  const fieldStyle =
    "h-9 w-16 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-900 outline-none focus:border-stone-400";

  return (
    <form action={action} className="space-y-3">
      <input name="jobSourceId" type="hidden" value={jobSourceId} />
      <input name="redirectPath" type="hidden" value={redirectPath} />
      <input name="scheduleCron" type="hidden" value={cron} />

      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input
          checked={enabled}
          name="scheduleEnabled"
          onChange={(e) => setEnabled(e.target.checked)}
          type="checkbox"
        />
        Ativar agendamento da fonte
      </label>

      <div className="flex flex-col gap-2 text-sm text-stone-700">
        <label className="flex items-center gap-2">
          <input
            checked={scheduleType === "DAILY"}
            name="humanScheduleType"
            onChange={() => setScheduleType("DAILY")}
            type="radio"
          />
          Todo dia às
          {scheduleType === "DAILY" && (
            <>
              <input
                className={fieldStyle}
                max={23}
                min={0}
                onChange={(e) => setHour(e.target.value)}
                type="number"
                value={hour}
              />
              :
              <input
                className={fieldStyle}
                max={59}
                min={0}
                onChange={(e) => setMinute(e.target.value)}
                type="number"
                value={minute}
              />
            </>
          )}
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={scheduleType === "EVERY_N_HOURS"}
            name="humanScheduleType"
            onChange={() => setScheduleType("EVERY_N_HOURS")}
            type="radio"
          />
          <span>A cada</span>
          {scheduleType === "EVERY_N_HOURS" && (
            <input
              className={fieldStyle}
              max={24}
              min={1}
              onChange={(e) => setInterval(e.target.value)}
              type="number"
              value={interval}
            />
          )}
          <span>horas</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={scheduleType === "WEEKLY"}
            name="humanScheduleType"
            onChange={() => setScheduleType("WEEKLY")}
            type="radio"
          />
          Toda semana às
          {scheduleType === "WEEKLY" && (
            <>
              <input
                className={fieldStyle}
                max={23}
                min={0}
                onChange={(e) => setHour(e.target.value)}
                type="number"
                value={hour}
              />
              :
              <input
                className={fieldStyle}
                max={59}
                min={0}
                onChange={(e) => setMinute(e.target.value)}
                type="number"
                value={minute}
              />
            </>
          )}
        </label>
        {scheduleType === "WEEKLY" && (
          <div className="flex gap-1.5 pl-6">
            {WEEKDAY_LABELS.map((label, day) => (
              <button
                className={`rounded-md px-2 py-1 text-[11px] ${
                  daysOfWeek.includes(day)
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-500"
                }`}
                key={label}
                onClick={() => toggleDay(day)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button className={buttonVariants({ size: "sm" })} type="submit">
        Salvar agendamento
      </button>
    </form>
  );
}
