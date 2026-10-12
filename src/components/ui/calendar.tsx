"use client";

import * as React from "react";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "ui-calendar-root",
        className,
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("", defaultClassNames.root),
        months: cn("", defaultClassNames.months),
        month: cn("", defaultClassNames.month),
        nav: cn(
          "",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "",
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          "",
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          "",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn("", defaultClassNames.dropdown),
        caption_label: cn(
          "",
          captionLayout === "label"
            ? ""
            : "",
          defaultClassNames.caption_label,
        ),
        table: "w-full border-collapse",
        weekdays: cn("", defaultClassNames.weekdays),
        weekday: cn(
          "",
          defaultClassNames.weekday,
        ),
        week: cn("", defaultClassNames.week),
        week_number_header: cn("", defaultClassNames.week_number_header),
        week_number: cn(
          "",
          defaultClassNames.week_number,
        ),
        day: cn(
          "group/day",
          defaultClassNames.day,
        ),
        range_start: cn("", defaultClassNames.range_start),
        range_middle: cn("", defaultClassNames.range_middle),
        range_end: cn("", defaultClassNames.range_end),
        today: cn(
          "",
          defaultClassNames.today,
        ),
        outside: cn(
          "",
          defaultClassNames.outside,
        ),
        disabled: cn("", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />;
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return <ChevronLeftIcon className={cn("", className)} {...props} />;
          }

          if (orientation === "right") {
            return <ChevronRightIcon className={cn("", className)} {...props} />;
          }

          return <ChevronDownIcon className={cn("", className)} {...props} />;
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div >
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers["focused"]) ref.current?.focus();
  }, [modifiers]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers["selected"] &&
        !modifiers["range_start"] &&
        !modifiers["range_end"] &&
        !modifiers["range_middle"]
      }
      data-range-start={modifiers["range_start"]}
      data-range-end={modifiers["range_end"]}
      data-range-middle={modifiers["range_middle"]}
      className={cn(
        "",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
