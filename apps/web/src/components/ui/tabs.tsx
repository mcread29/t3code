"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "~/lib/utils";

const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-2xl border border-border bg-muted/40 p-1",
        className,
      )}
      data-slot="tabs-list"
      {...props}
    />
  );
}

function TabsTab({ className, children, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm hover:text-foreground",
        className,
      )}
      data-slot="tabs-tab"
      {...props}
    >
      {children}
    </TabsPrimitive.Tab>
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn("outline-none", className)}
      data-slot="tabs-panel"
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTab, TabsPanel };
