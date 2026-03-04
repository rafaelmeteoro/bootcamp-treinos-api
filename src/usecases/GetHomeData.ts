import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { NotFoundError } from "../erros/index.js";
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
  date: string;
}

interface OutputDto {
  activeWorkoutPlanId: string;
  todayWorkoutDay: {
    workoutPlanId: string;
    id: string;
    name: string;
    isRest: boolean;
    weekDay: string;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string;
    exercisesCount: number;
  } | null;
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    { workoutDayCompleted: boolean; workoutDayStarted: boolean }
  >;
}

export class GetHomeData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const parsedDate = dayjs.utc(dto.date);

    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: {
        workoutDays: {
          include: {
            _count: { select: { exercises: true } },
          },
        },
      },
    });

    if (!workoutPlan) {
      throw new NotFoundError("No active workout plan found");
    }

    const workoutDayIds = workoutPlan.workoutDays.map((d) => d.id);

    // Today's workout day
    const todayWeekDay = DAY_INDEX_TO_WEEK_DAY[parsedDate.day()];
    const todayWorkoutDayData = workoutPlan.workoutDays.find(
      (d) => d.weekDay === todayWeekDay,
    );

    // Week range: Sunday 00:00:00 UTC → Saturday 23:59:59 UTC
    const startOfWeek = parsedDate.startOf("week");
    const endOfWeek = parsedDate.endOf("week");

    // Sessions within the week for consistencyByDay
    const weekSessions = await prisma.workoutSession.findMany({
      where: {
        workoutDayId: { in: workoutDayIds },
        startedAt: { gte: startOfWeek.toDate(), lte: endOfWeek.toDate() },
      },
      select: { startedAt: true, completedAt: true },
    });

    // Build consistencyByDay — all 7 days initialised to false
    const consistencyByDay: Record<
      string,
      { workoutDayCompleted: boolean; workoutDayStarted: boolean }
    > = {};

    for (let i = 0; i < 7; i++) {
      const key = startOfWeek.add(i, "day").format("YYYY-MM-DD");
      consistencyByDay[key] = {
        workoutDayCompleted: false,
        workoutDayStarted: false,
      };
    }

    for (const session of weekSessions) {
      const key = dayjs.utc(session.startedAt).format("YYYY-MM-DD");
      if (consistencyByDay[key]) {
        consistencyByDay[key].workoutDayStarted = true;
        if (session.completedAt) {
          consistencyByDay[key].workoutDayCompleted = true;
        }
      }
    }

    // Completed sessions for streak (last 365 days)
    const completedSessions = await prisma.workoutSession.findMany({
      where: {
        workoutDayId: { in: workoutDayIds },
        completedAt: { not: null },
        startedAt: { gte: parsedDate.subtract(365, "day").toDate() },
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
      workoutPlan.workoutDays.map((d) => [d.weekDay, d]),
    );

    let workoutStreak = 0;
    for (let i = 0; i < 365; i++) {
      const checkDate = parsedDate.subtract(i, "day");
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

    return {
      activeWorkoutPlanId: workoutPlan.id,
      todayWorkoutDay: todayWorkoutDayData
        ? {
            workoutPlanId: workoutPlan.id,
            id: todayWorkoutDayData.id,
            name: todayWorkoutDayData.name,
            isRest: todayWorkoutDayData.isRest,
            weekDay: todayWorkoutDayData.weekDay,
            estimatedDurationInSeconds:
              todayWorkoutDayData.estimatedDurationInSeconds,
            coverImageUrl: todayWorkoutDayData.coverImageUrl ?? undefined,
            exercisesCount: todayWorkoutDayData._count.exercises,
          }
        : null,
      workoutStreak,
      consistencyByDay,
    };
  }
}
