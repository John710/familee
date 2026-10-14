/**
 * Familee - the birthdays of the next two weeks in the top bar and their formatting.
 *
 * The bell is a server part: it reads the birthdays of every tree of the signed-in person and
 * passes the lines to the menu. The same lines are used on the home page.
 */

import { getLocale, getTranslations } from "next-intl/server";

import { type BirthdayItem, BirthdayMenu } from "@/components/layout/birthday-menu";
import { birthdaysForUser, type UserBirthday } from "@/lib/birthdays";
import { getCurrentUser } from "@/lib/session";

/** The lines of the birthday lists, as the reader sees them: the day, the age, the tree. */
export async function birthdayItems(entries: UserBirthday[]): Promise<BirthdayItem[]> {
    const t = await getTranslations();
    const locale = await getLocale();
    const dayFormat = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
    });
    return entries.map((entry) => ({
        key: `${entry.href}-${entry.date}`,
        href: entry.href,
        name: entry.name || t("common.unknown"),
        treeTitle: entry.treeTitle,
        dayLabel:
            entry.inDays === 0
                ? t("birthdays.today")
                : dayFormat.format(new Date(`${entry.date}T00:00:00Z`)),
        turnsLabel: t("birthdays.turns", { count: entry.turns }),
        photoUrl: entry.photoUrl,
    }));
}

export async function BirthdayBell() {
    const user = await getCurrentUser();
    if (!user) return null;
    const t = await getTranslations();
    const items = await birthdayItems(await birthdaysForUser(user.id));
    return (
        <BirthdayMenu label={t("birthdays.title")} emptyLabel={t("birthdays.none")} items={items} />
    );
}
