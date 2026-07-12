import { PenLine, Search, GraduationCap, Briefcase } from "lucide-react";

const SEGMENTS = [
  {
    icon: PenLine,
    title: "Writers & Content Creators",
    description: "Grammar checking, paraphrasing, and AI writing tools to produce polished content faster.",
  },
  {
    icon: Search,
    title: "SEO & Marketing Professionals",
    description: "Keyword research, competitor analysis, and optimization tools to grow organic traffic.",
  },
  {
    icon: GraduationCap,
    title: "Students & Researchers",
    description: "Plagiarism checking and writing assistance tools that support academic work.",
  },
  {
    icon: Briefcase,
    title: "Freelancers & Small Teams",
    description: "Premium software access without the cost of individual full-price subscriptions.",
  },
];

export function WhoItsFor() {
  return (
    <section className="py-20 bg-white border-t border-border">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-heading tracking-tight mb-4 uppercase text-foreground">
            <span className="text-primary">Who It&rsquo;s</span> For
          </h2>
          <div className="w-24 h-1.5 bg-accent mx-auto rounded-full"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {SEGMENTS.map((seg) => (
            <div key={seg.title} className="flex flex-col items-center text-center px-4">
              <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-5">
                <seg.icon className="w-7 h-7 text-accent" />
              </div>
              <h3 className="font-bold text-foreground text-base mb-2">{seg.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{seg.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
