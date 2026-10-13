/**
 * Familee - navigation that knows about the language
 *
 * Instead of `next/link` and `next/navigation` the whole application uses
 * the wrappers from here: they add the language prefix (/en/tree) themselves
 * and keep it across navigations.
 */

import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
