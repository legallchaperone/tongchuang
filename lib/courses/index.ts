import type { Course } from "./types";
import { CS336 } from "./cs336";

export * from "./types";

/** every course on offer, newest first */
export const COURSES: Course[] = [CS336];

export const getCourse = (id: string): Course | null => COURSES.find((c) => c.id === id) || null;
