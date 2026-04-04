"use client";

import { Box, Lock, Search, Settings, Sparkles } from "lucide-react";
import { GlowingEffect } from "./GlowingEffect";
import { cn } from "../../lib/utils";

export function GlowingEffectDemo() {
  return (
    <ul className="grid grid-cols-1 grid-rows-none gap-4 md:grid-cols-12 md:grid-rows-3 lg:gap-4 xl:max-h-[34rem] xl:grid-rows-2 p-0 m-0">
      <GridItem
        area="md:[grid-area:1/1/2/7] xl:[grid-area:1/1/2/5]"
        icon={<Box className="h-4 w-4 text-[#EDEDEF] opacity-70" />}
        title="AI Engineering Tools"
        description="Functional AI utilities built for real problems and shipped fast."
      />
      <GridItem
        area="md:[grid-area:1/7/2/13] xl:[grid-area:2/1/3/5]"
        icon={<Settings className="h-4 w-4 text-[#EDEDEF] opacity-70" />}
        title="Custom Requests"
        description="You demand, we supply. Tell us what to build next."
      />
      <GridItem
        area="md:[grid-area:2/1/3/7] xl:[grid-area:1/5/3/8]"
        icon={<Lock className="h-4 w-4 text-[#EDEDEF] opacity-70" />}
        title="Secure infrastructure"
        description="Your data is protected with enterprise-grade security."
      />
      <GridItem
        area="md:[grid-area:2/7/3/13] xl:[grid-area:1/8/2/13]"
        icon={<Sparkles className="h-4 w-4 text-[#EDEDEF] opacity-70" />}
        title="Premium AI Models"
        description="Powered by the most advanced LLMs available today."
      />
      <GridItem
        area="md:[grid-area:3/1/4/13] xl:[grid-area:2/8/3/13]"
        icon={<Search className="h-4 w-4 text-[#EDEDEF] opacity-70" />}
        title="Lightning fast"
        description="Optimized inference architecture for millimeter precision and speed."
      />
    </ul>
  );
}

const GridItem = ({ area, icon, title, description }) => {
  return (
    <li className={cn("min-h-[14rem] list-none", area)}>
      <div className="relative h-full rounded-[1.25rem] border border-[#1C1C22] p-2 md:rounded-[1.5rem] md:p-3 bg-[#09090B]">
        <GlowingEffect
          spread={40}
          glow={true}
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
          borderWidth={3}
        />
        <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-xl border border-[#1C1C22] bg-[#111113] p-6 shadow-card hover:border-[#27272F] transition-colors md:p-6 group">
          <div className="relative flex flex-1 flex-col justify-between gap-3">
            <div className="w-fit rounded-lg border border-[#27272F] bg-[#1A1A1F] p-2 group-hover:border-[#33333D] transition-colors">
              {icon}
            </div>
            <div className="space-y-3">
              <h3 className="pt-0.5 text-xl leading-[1.375rem] font-semibold font-sans tracking-tight md:text-2xl md:leading-[1.875rem] text-balance text-white">
                {title}
              </h3>
              <h2 className="[&_b]:md:font-semibold [&_strong]:md:font-semibold font-sans text-sm leading-[1.125rem] md:text-base md:leading-[1.375rem] text-[#EDEDEF] opacity-70">
                {description}
              </h2>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
};
