import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

dayjs.extend(utc);

const DAY_INDEX_TO_WEEK_DAY: Record<number, WeekDay> = {
  0: WeekDay.SUNDAY,
  1: WeekDay.MONDAY,
  2: WeekDay.TUESDAY,
  3: WeekDay.WEDNESDAY,
  4: WeekDay.THURSDAY,
  5: WeekDay.FRIDAY,
  6: WeekDay.SATURDAY,
};

interface InputDto {
  userId: string;
  from: string;
  to: string;
}

interface OutputDto {
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    { workoutDayCompleted: boolean; workoutDayStarted: boolean }
  >;
  completedWorkoutsCount: number;
  conclusionRate: number;
  totalTimeInSeconds: number;
}

export class GetStats {
  async execute(dto: InputDto): Promise<OutputDto> {
    const fromDate = dayjs.utc(dto.from).startOf("day");
    const toDate = dayjs.utc(dto.to).endOf("day");

    // All sessions in the date range belonging to the user
    const sessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: {
          workoutPlan: { userId: dto.userId },
        },
        startedAt: { gte: fromDate.toDate(), lte: toDate.toDate() },
      },
      select: { startedAt: true, completedAt: true },
    });

    // consistencyByDay — only days with at least one session
    const consistencyByDay: Record<
      string,
      { workoutDayCompleted: boolean; workoutDayStarted: boolean }
    > = {};

    let completedWorkoutsCount = 0;
    let totalTimeInSeconds = 0;

    for (const session of sessions) {
      const key = dayjs.utc(session.startedAt).format("YYYY-MM-DD");

      if (!consistencyByDay[key]) {
        consistencyByDay[key] = {
          workoutDayCompleted: false,
          workoutDayStarted: false,
        };
      }

      consistencyByDay[key].workoutDayStarted = true;

      if (session.completedAt) {
        consistencyByDay[key].workoutDayCompleted = true;
        completedWorkoutsCount++;

        const diffSeconds =
          (session.completedAt.getTime() - session.startedAt.getTime()) / 1000;
        totalTimeInSeconds += diffSeconds;
      }
    }

    const totalSessions = sessions.length;
    const conclusionRate =
      totalSessions > 0 ? completedWorkoutsCount / totalSessions : 0;

    // Streak: active plan days completed consecutively going backwards from `to`
    const activeWorkoutPlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: { workoutDays: true },
    });

    let workoutStreak = 0;

    if (activeWorkoutPlan) {
      const workoutDayIds = activeWorkoutPlan.workoutDays.map((d) => d.id);

      const completedSessions = await prisma.workoutSession.findMany({
        where: {
          workoutDayId: { in: workoutDayIds },
          completedAt: { not: null },
          startedAt: {
            gte: dayjs.utc(dto.to).subtract(365, "day").toDate(),
          },
        },
        select: { workoutDayId: true, startedAt: true },
      });

      const completedKeys = new Set(
        completedSessions.map(
          (s) =>
            `${s.workoutDayId}:${dayjs.utc(s.startedAt).format("YYYY-MM-DD")}`,
        ),
      );

      const workoutDayByWeekDay = new Map(
        activeWorkoutPlan.workoutDays.map((d) => [d.weekDay, d]),
      );

      const toDateParsed = dayjs.utc(dto.to);

      for (let i = 0; i < 365; i++) {
        const checkDate = toDateParsed.subtract(i, "day");
        const planDay = workoutDayByWeekDay.get(
          DAY_INDEX_TO_WEEK_DAY[checkDate.day()],
        );

        if (!planDay) continue;

        if (
          completedKeys.has(`${planDay.id}:${checkDate.format("YYYY-MM-DD")}`)
        ) {
          workoutStreak++;
        } else {
          break;
        }
      }
    }

    return {
      workoutStreak,
      consistencyByDay,
      completedWorkoutsCount,
      conclusionRate,
      totalTimeInSeconds,
    };
  }
}
