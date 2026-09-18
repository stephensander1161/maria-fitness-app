"use client";

import { createContext, useContext } from "react";
import { DEFAULT_COACH_NAME } from "@/lib/coach-name";

/**
 * Her name for the coach, for every button that names him.
 *
 * Read from the profile once in the root layout and handed down here, so
 * "Ask your coach" can say "Ask Bertha" without every surface being taught
 * to fetch a profile. Absent (signed out, the login screen) it is "Coach".
 */
const CoachNameContext = createContext<string>(DEFAULT_COACH_NAME);

export const CoachNameProvider = CoachNameContext.Provider;
export const useCoachName = (): string => useContext(CoachNameContext);
