export const queueNames = {
  crawlScheduling: "crawl:scheduling",
  jobIngestion: "jobs:ingestion",
  fitRecompute: "jobs:fit-recompute",
  alertDispatch: "alerts:dispatch",
  resumeTailoringAudit: "resume-tailoring:audit",
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

export type QueueDefinition = {
  description: string;
  name: QueueName;
};

export const plannedQueues: ReadonlyArray<QueueDefinition> = [
  {
    description: "Schedules crawl runs across configured career sources.",
    name: queueNames.crawlScheduling,
  },
  {
    description: "Normalizes and persists raw job observations.",
    name: queueNames.jobIngestion,
  },
  {
    description:
      "Recomputes candidate-to-job fit after profile or vacancy changes.",
    name: queueNames.fitRecompute,
  },
  {
    description: "Dispatches candidate alerts and workflow notifications.",
    name: queueNames.alertDispatch,
  },
  {
    description: "Persists tailoring provenance and audit follow-up work.",
    name: queueNames.resumeTailoringAudit,
  },
];

const queueNameSet = new Set<QueueName>(Object.values(queueNames));

export function isQueueName(value: string): value is QueueName {
  return queueNameSet.has(value as QueueName);
}
