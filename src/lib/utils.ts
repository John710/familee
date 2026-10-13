/**
 * Familee - small utilities needed in many components
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and removes Tailwind conflicts: the last class of one
 * group wins (for example `p-2` and `p-4`), so the classes coming from
 * props always override the base ones.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
