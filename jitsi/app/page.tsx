"use client";

import { Grid2X2, MessageSquareText, MonitorUp, ShieldCheck, Video } from "lucide-react";

import { JoinForm } from "@/components/join-form";
import { ThemeToggle } from "@/components/theme-toggle";

const featureItems = [
  {
    label: "Media",
    value: "Jitsi audio, camera, and screen share",
    Icon: Video,
  },
  {
    label: "Room UI",
    value: "Embedded Jitsi Meet conference",
    Icon: Grid2X2,
  },
  {
    label: "Chat",
    value: "Jitsi in-room messaging",
    Icon: MessageSquareText,
  },
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.38),transparent_38%,rgba(17,24,39,0.08))] dark:bg-[linear-gradient(to_bottom,rgba(16,18,20,0.42),transparent_38%,rgba(16,18,20,0.7))]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <Video className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary">BlueRoom Jitsi</p>
              <h1 className="text-lg font-semibold tracking-tight">Meet in seconds</h1>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.08fr_0.92fr] lg:py-16">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 py-1 text-sm text-muted-foreground shadow-sm backdrop-blur">
              <MonitorUp className="size-4 text-primary" />
              Next.js 16 + Jitsi room embed
            </span>
            <h2 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              A clean meeting room shell around Jitsi Meet.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              Create a room, share the link, and use Jitsi for live video,
              audio, chat, tile view, and screen sharing.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {featureItems.map(({ label, value, Icon }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur"
                >
                  <div className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-base font-medium">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-card/70 px-4 py-3 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" />
              Uses your configured Jitsi domain, defaulting to meet.jit.si.
            </div>
          </div>

          <JoinForm />
        </section>
      </div>
    </main>
  );
}
